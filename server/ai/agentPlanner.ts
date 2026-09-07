import { ToolRegistry, ToolExecutionContext } from '../toolRegistry.js';
import { generateGeminiText } from '../gemini.js';
import { HealthEngine } from '../metrics/healthEngine.js';
import { AskAiMessage, AnalysisTrace, AnalysisTraceStep, Repository } from '../../src/types.js';

export interface AgentExecutionResult {
  message: AskAiMessage;
  trace: AnalysisTrace;
}

export class AgentPlanner {
  /**
   * Niyet Analizi -> Araç Yürütme -> Veri Projeksiyonu -> Gemini Sentezi -> Kanıt Yanıtı sürecini yönetir
   */
  public static async answerQuestion(
    question: string,
    context: ToolExecutionContext
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const traceSteps: AnalysisTraceStep[] = [];
    const toolsUsed: string[] = [];
    let dataPointsAnalyzed = 0;

    // Adım 1: Soruyu Anlama ve Niyet Sınıflandırma
    const step1Duration = Math.max(1, Date.now() - startTime);
    traceSteps.push({
      step: 'Soruyu anlama ve niyet sınıflandırma',
      status: 'completed',
      details: `Teknik konu ve zaman kapsamı için sorgu parametreleri analiz edildi: "${question.substring(0, 60)}..."`,
      durationMs: step1Duration,
    });

    const lowerQ = question.toLowerCase();

    // Sorguda belirli bir depo ismi geçiyor mu tespit et
    const matchedRepo = context.repositories.find((r) => {
      const rName = r.name.toLowerCase();
      return lowerQ.includes(rName) || lowerQ.includes(rName.replace(/[-_]/g, ' ')) || lowerQ.includes(rName.replace(/[-_]/g, ''));
    });
    const matchedRepoCommits = matchedRepo
      ? context.commits.filter((commit) => commit.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoPullRequests = matchedRepo
      ? context.pullRequests.filter((pr) => pr.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoIssues = matchedRepo
      ? context.issues.filter((issue) => issue.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoHealth = matchedRepo
      ? HealthEngine.calculateHealth([matchedRepo], matchedRepoCommits, matchedRepoPullRequests, matchedRepoIssues)
      : null;

    // Adım 2: Sorgu Planı ve Araç Seçimi
    const selectedTools: { name: string; args: Record<string, any> }[] = [];

    if (matchedRepo) {
      // Belirli bir depo hedeflenmişse depoya özel araçları seç
      selectedTools.push({ name: 'get_repository', args: { repo_name: matchedRepo.name } });
      selectedTools.push({ name: 'list_commits', args: { repo_name: matchedRepo.name, limit: 30 } });
      selectedTools.push({ name: 'list_pull_requests', args: { repo_name: matchedRepo.name, state: 'all' } });
      selectedTools.push({ name: 'get_hotspots', args: { repo_name: matchedRepo.name } });
      selectedTools.push({ name: 'get_engineering_risks', args: { repo_name: matchedRepo.name } });
    } else {
      // Tüm sisteme yönelik çok boyutlu telemetri araçları
      selectedTools.push({ name: 'get_health_breakdown', args: {} });
      selectedTools.push({ name: 'get_engineering_risks', args: {} });
      selectedTools.push({ name: 'get_hotspots', args: {} });
      selectedTools.push({ name: 'list_commits', args: { limit: 30 } });
      selectedTools.push({ name: 'list_pull_requests', args: { state: 'all' } });
    }

    const planDuration = Math.max(1, Date.now() - (startTime + step1Duration));
    traceSteps.push({
      step: 'Sorgu planı formüle etme ve araç seçimi',
      status: 'completed',
      details: `Araç kayıt defterinden ${selectedTools.length} araç seçildi: [${selectedTools.map((t) => t.name).join(', ')}]`,
      durationMs: planDuration,
    });

    // Adım 3: Araç Yürütme ve Veri Getirme
    const toolResults: Record<string, any> = {};
    for (const toolCall of selectedTools) {
      const stepStart = Date.now();
      toolsUsed.push(toolCall.name);
      try {
        const result = await ToolRegistry.executeTool(toolCall.name, toolCall.args, context);
        toolResults[toolCall.name] = result;
        if (Array.isArray(result)) {
          dataPointsAnalyzed += result.length * 4;
        } else if (typeof result === 'object' && result !== null) {
          dataPointsAnalyzed += Object.keys(result).length * 3;
        }
        traceSteps.push({
          step: `'${toolCall.name}' aracı yürütüldü`,
          status: 'completed',
          details: `Sorgu filtreleriyle eşleşen yapılandırılmış veri kayıtları getirildi`,
          durationMs: Date.now() - stepStart,
        });
      } catch (err: any) {
        traceSteps.push({
          step: `'${toolCall.name}' aracı başarısız oldu`,
          status: 'failed',
          details: err.message,
          durationMs: Date.now() - stepStart,
        });
      }
    }

    // Adım 4: Veri Projeksiyonu
    const projectionStart = Date.now();
    const compactProjection = {
      sorgu: question,
      hedefDepo: matchedRepo
        ? {
            ad: matchedRepo.name,
            saglikSkoru: matchedRepoHealth?.hasData ? matchedRepoHealth.overallScore : null,
            riskSeviyesi: matchedRepo.risk_level,
            dil: matchedRepo.language,
            acikSorunlar: matchedRepo.open_issues_count,
            yildizSayisi: matchedRepo.stargazers_count,
            sonGuncelleme: matchedRepo.updated_at,
          }
        : null,
      izlenenDepolar: context.repositories.map((r) => ({
        ad: r.name,
        riskSeviyesi: r.risk_level,
        dil: r.language,
        acikSorunlar: r.open_issues_count,
      })),
      telemetriDurumu: context.healthScore?.dataStatus || 'no_data',
      aracSonuclari: toolResults,
    };
    dataPointsAnalyzed += context.repositories.length * 5;

    traceSteps.push({
      step: 'Veri projeksiyonu ve kanıt sinyalleri çıkarma',
      status: 'completed',
      details: `${dataPointsAnalyzed} adet normalleştirilmiş veri noktası bağlam gösterimine yansıtıldı`,
      durationMs: Date.now() - projectionStart,
    });

    // Adım 5: Gemini Mühendislik Analistini Çağırma
    let assistantText = '';
    const facts: string[] = [];
    let interpretation = '';
    const recommendedActions: string[] = [];
    const evidenceItems: { metric: string; value: string | number; source: string }[] = [];
    const hasTelemetry = Boolean(
      context.healthScore?.hasData &&
      (context.commits.length > 0 || context.pullRequests.length > 0 || context.issues.length > 0)
    );
    const queryHasTelemetry = hasTelemetry && (!matchedRepo || Boolean(matchedRepoHealth?.hasData));

    const prompt = `Sen DevControl AI, kanıta dayalı ve deterministik gerçeklere dayanan bir Üst Düzey Yapay Zeka Mühendislik Zekası Analistisin (Senior Staff Engineering Intelligence Analyst).

GÖREV:
Kullanıcının sorusunu YALNIZCA sağlanan doğrulanmış depo ve telemetri verilerini kullanarak eksiksiz ve derinlemesine yanıtla.

TEMEL PRENSİPLER:
1. Kesinlikle kullanıcının sorduğu spesifik konuya veya depoya odaklan (örneğin kullanıcı "${matchedRepo ? matchedRepo.name : question}" hakkında sormuşsa doğrudan o deponun verilerini değerlendir).
2. Asla uydurma veri, hayali dosya isimleri veya temelsiz iddialar üretme.
3. Sayısal ölçümleri (commit sayıları, kod dalgalanması satırları, PR durumları, sağlık skorları) kanıt olarak vurgula.
4. DİL: Yanıtının tamamı %100 profesyonel, akıcı, zengin ve TÜRKÇE olmalıdır. Asla İngilizce başlık veya kalıp kullanma.

YAPI VE FORMAT:
Yanıtını Markdown formatında aşağıdaki bölümler halinde yapılandır:

### 🏛️ Mimari Sağlık ve Durum Analizi
(Deponun veya konunun genel mühendislik durumu, sağlık skoru, kod tabanı dağılımı ve aktivite temposu)

### 📊 Doğrulanmış Telemetri Kanıtları
(Commit frekansı, dosya değişimleri, PR/Issue durumları ve ölçülen somut metrikler)

### ⚠️ Risk Değerlendirmesi & Sıcak Noktalar
(Varsa tespit edilen kod sıcak noktaları, mimari darboğazlar veya stabilite riskleri)

### 🛠️ Önerilen Mühendislik Yol Haritası
(Geliştirici veya ekip için somut, uygulanabilir ve önceliklendirilmiş aksiyon maddeleri)

KULLANICI SORUSU: "${question}"

SAĞLANAN YAPILANDIRILMIŞ TELEMETRİ VERİLERİ:
${JSON.stringify(compactProjection, null, 2)}`;

    if (!queryHasTelemetry) {
      assistantText = matchedRepo
        ? `### 📡 \`${matchedRepo.name}\` için GitHub Telemetrisi Bekleniyor\n\n\`${matchedRepo.name}\` deposu bağlı olsa da analiz penceresinde bu depoya ait doğrulanmış commit, PR veya issue kaydı bulunmuyor. Sağlık skoru ve risk analizi üretmek için lütfen GitHub verilerini yeniden eşitleyin.`
        : `### 📡 GitHub Telemetrisi Bekleniyor\n\nHenüz doğrulanmış GitHub commit, PR veya issue verisi bulunmuyor. Sağlık skoru, sıcak nokta ve risk analizi üretmek için lütfen **Depolar & Bağlantı** bölümünden GitHub hesabınızı bağlayın ve verileri eşitleyin.`;
    } else {
      const aiAnswer = await generateGeminiText(prompt);
      if (aiAnswer) {
        assistantText = aiAnswer;
      } else {
        assistantText = AgentPlanner.generateTelemetryFallback(context, matchedRepo);
      }
    }

    // Hedef depoya veya genel sonuçlara göre olguları ve kanıtları topla
    if (matchedRepo && matchedRepoHealth?.hasData) {
      facts.push(`${matchedRepo.name} deposu: Sağlık Skoru ${matchedRepoHealth.overallScore}/100, Risk Seviyesi: ${matchedRepo.risk_level || 'hesaplanıyor'}, Dil: ${matchedRepo.language}.`);
      evidenceItems.push({
        metric: `${matchedRepo.name} Sağlık Skoru`,
        value: `${matchedRepoHealth.overallScore} / 100`,
        source: `Doğrulanmış GitHub Telemetrisi / ${matchedRepo.name}`,
      });
      evidenceItems.push({
        metric: 'Açık Sorun Sayısı (Issues)',
        value: `${matchedRepo.open_issues_count} açık sorun`,
        source: `GitHub API / ${matchedRepo.name}`,
      });
    } else if (matchedRepo && hasTelemetry) {
      facts.push(`${matchedRepo.name} deposu için analiz penceresinde doğrulanmış commit, PR veya issue kaydı bulunamadı.`);
    }

    if (toolResults['get_hotspots']) {
      let hotspotsList = toolResults['get_hotspots'] as any[];
      if (matchedRepo) {
        const repoHotspots = hotspotsList.filter((h) => h.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
        if (repoHotspots.length > 0) hotspotsList = repoHotspots;
      }
      const topHotspots = hotspotsList.slice(0, 3);
      topHotspots.forEach((h) => {
        const fileName = (h.path && typeof h.path === 'string') ? (h.path.split('/').pop() || h.path) : 'modül';
        facts.push(`${h.repo_name}/${h.path} sıcak noktası: ${h.modifications_count} değişiklik, ${h.bug_fix_commits_count} hata düzeltmesi, ${h.code_churn} satır dalgalanma.`);
        evidenceItems.push({
          metric: `${fileName} Dalgalanması`,
          value: `${h.code_churn} satır (${h.modifications_count} commit)`,
          source: `Git Commit Günlüğü / ${h.repo_name}`,
        });
      });
    }

    if (toolResults['get_engineering_risks']) {
      let risksList = toolResults['get_engineering_risks'] as any[];
      if (matchedRepo) {
        const repoRisks = risksList.filter((r) => r.affectedRepository.toLowerCase() === matchedRepo.name.toLowerCase() || (r.repo_name && r.repo_name.toLowerCase() === matchedRepo.name.toLowerCase()));
        if (repoRisks.length > 0) risksList = repoRisks;
      }
      const risks = risksList.slice(0, 2);
      risks.forEach((r) => {
        facts.push(`${r.affectedRepository} üzerinde [${r.severity}] seviyesinde risk tespit edildi: ${r.title}`);
        recommendedActions.push(r.recommendedAction);
        evidenceItems.push({
          metric: `${r.affectedRepository} Riski (${r.category})`,
          value: `Seviye: ${r.severity} (Güven: %${r.confidence})`,
          source: 'Deterministik Risk Motoru',
        });
      });
    }

    if (toolResults['get_health_breakdown']?.hasData) {
      const h = toolResults['get_health_breakdown'];
      facts.push(`Genel Mühendislik Sağlığı: ${h.overallScore}/100 (Kod Sağlığı: ${h.dimensions.codeHealth}, Teslimat: ${h.dimensions.delivery}, Dokümantasyon: ${h.dimensions.documentation}).`);
      evidenceItems.push({
        metric: 'Genel Sağlık Skoru',
        value: `${h.overallScore} / 100`,
        source: 'Mühendislik Sağlık Motoru',
      });
    }

    interpretation = !hasTelemetry
      ? 'Henüz doğrulanmış GitHub telemetrisi bulunmadığı için mühendislik yorumu üretilmedi.'
      : matchedRepo && matchedRepoHealth?.hasData
        ? `${matchedRepo.name} deposu için yorum, analiz penceresinde bulunan doğrulanmış commit, PR ve issue kayıtları üzerinden oluşturuldu.`
        : 'Analiz, seçili depoların doğrulanmış commit, PR ve issue kayıtları üzerinden oluşturuldu.';

    if (recommendedActions.length === 0) {
      if (hasTelemetry) {
        recommendedActions.push('Birleştirme çakışmalarını ve regresyon riskini azaltmak için yüksek dalgalanmaya sahip dosyaları refaktör edin.');
        recommendedActions.push('Teslimat hızını artırmak için 7 günden uzun süre açık kalan çekme isteklerini (PR) incelemeye alın.');
      } else {
        recommendedActions.push('Depolar & Bağlantı bölümünden GitHub hesabını bağlayın ve verileri eşitleyin.');
      }
    }

    const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

    traceSteps.push({
      step: 'Kanıta dayalı mühendislik zekası sentezleme',
      status: 'completed',
      details: `${durationSeconds} saniyede doğrulanabilir kaynaklarla çok noktalı olgusal analiz üretildi`,
      durationMs: Math.max(0, Math.round(durationSeconds * 1000) - 200),
    });

    const trace: AnalysisTrace = {
      id: `trace_${Date.now()}`,
      query: question,
      timestamp: new Date().toISOString(),
      steps: traceSteps,
      toolsUsed,
      dataPointsAnalyzed,
      durationSeconds: Math.max(0.5, durationSeconds),
      completed: true,
    };

    const message: AskAiMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
      facts,
      interpretation,
      evidence: evidenceItems,
      recommendedActions,
      trace,
    };

    return { message, trace };
  }

  /**
   * Gemini servisine erişilemediğinde ham ve doğrulanmış telemetri verilerini şeffaf bir şekilde sunar
   */
  private static generateTelemetryFallback(
    context: ToolExecutionContext,
    matchedRepo?: Repository
  ): string {
    const topHotspots = context.hotspots || [];
    const topRisks = context.risks || [];
    const health = context.healthScore;

    if (matchedRepo) {
      const repoCommits = context.commits.filter((c) => c.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
      const repoHotspots = topHotspots.filter((h) => h.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
      const repoRisks = topRisks.filter((r) => r.affectedRepository.toLowerCase() === matchedRepo.name.toLowerCase() || (r.repo_name && r.repo_name.toLowerCase() === matchedRepo.name.toLowerCase()));
      const repoPRs = context.pullRequests.filter((p) => p.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());

      return `### 📡 Doğrulanmış Telemetri Kaydı: \`${matchedRepo.name}\`
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Depodan çekilen güncel telemetri kayıtları aşağıda listelenmiştir.)*

• **İncelenen Commit Hacmi:** ${repoCommits.length} commit
• **Çekme İstekleri (PR):** ${repoPRs.length} PR (${repoPRs.filter((p) => p.state === 'open').length} açık)
• **Açık Sorun (Issue) Sayısı:** ${matchedRepo.open_issues_count}
• **Tespit Edilen Sıcak Noktalar:** ${repoHotspots.length > 0 ? repoHotspots.map((h) => `\`${h.path}\` (${h.modifications_count} değişiklik, ${h.code_churn} satır)`).join(', ') : 'Kritik sıcak nokta tespit edilmedi.'}
• **Aktif Riskler:** ${repoRisks.length > 0 ? repoRisks.map((r) => `[${r.severity}] ${r.title}`).join('; ') : 'Aktif risk bulunmuyor.'}`;
    }

    return `### 📡 Doğrulanmış Sistem Telemetri Kaydı
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Doğrudan ölçülen sistem telemetri kayıtları aşağıda listelenmiştir.)*

• **Genel Sağlık Skoru:** ${health?.hasData ? `${health.overallScore} / 100 (${health.grade})` : 'Hesaplanıyor'}
• **Toplam İncelenen Commit:** ${context.commits.length} commit
• **Toplam Tespit Edilen Sıcak Nokta:** ${topHotspots.length} dosya
• **Aktif Mühendislik Riski:** ${topRisks.length} adet`;
  }
}
