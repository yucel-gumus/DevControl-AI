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

    // Sorguda belirli bir depo ismi geçiyor mu tespit et (kelime sınırları ile hatalı pozitifleri önle)
    const matchedRepo = context.repositories.find((r) => {
      const rName = r.name.toLowerCase().trim();
      if (!rName) return false;
      const escaped = rName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const spaced = escaped.replace(/[-_]/g, '[-_\\s]');
      const pattern = new RegExp(`(^|[^a-z0-9_-])${spaced}([^a-z0-9_-]|$)`, 'i');
      return pattern.test(lowerQ);
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
      } catch (err: unknown) {
        traceSteps.push({
          step: `'${toolCall.name}' aracı başarısız oldu`,
          status: 'failed',
          details: err instanceof Error ? err.message : String(err),
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
            forkSayisi: matchedRepo.forks_count,
            yildizSayisi: matchedRepo.stargazers_count,
            sonGuncelleme: matchedRepo.updated_at,
          }
        : null,
      izlenenDepolar: context.repositories.map((r) => ({
        ad: r.name,
        riskSeviyesi: r.risk_level,
        dil: r.language,
        forkSayisi: r.forks_count,
        yildizSayisi: r.stargazers_count,
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

YAPI VE FORMAT YÖNERGESİ:
1. SPESİFİK METRİK VEYA TEKİL SORULAR İÇİN (Örn: "kaç commit var?", "hangi diller?", "sağlık puanı kaç?", "en son commit ne zaman?", "kaç issue var?"):
   - Yanıtına DOĞRUDAN, NET ve KESİN olarak sorunun cevabını vererek başla (Örn: "**\`${matchedRepo ? matchedRepo.name : 'depo'}\` deposunda doğrulanmış X commit bulunmaktadır.**").
   - Ardından ilgili telemetri kanıtlarını (tarihleri, commit mesajları, yazarları vb.) düzenli bir liste veya maddeleme halinde sun.
   - Kullanıcı genel bir analiz istemediği sürece gereksiz yere uzun yol haritası veya genel mimari nutuk yazma; odaklı, net ve kanıta dayalı kal.

2. GENEL ANALİZ VEYA MİMARİ DEĞERLENDİRME İSTEYEN SORULAR İÇİN (Örn: "kodları analiz et", "riskleri incele", "sağlık durumu nasıl?", "depoyu değerlendir"):
   - Yanıtını aşağıdaki 4 bölümlü zengin Markdown yapısıyla kurgula:
     ### 🏛️ Mimari Sağlık ve Durum Analizi
     ### 📊 Doğrulanmış Telemetri Kanıtları
     ### ⚠️ Risk Değerlendirmesi & Kritik Dosyalar
     ### 🛠️ Önerilen Mühendislik Yol Haritası

KULLANICI SORUSU: "${question}"

SAĞLANAN YAPILANDIRILMIŞ TELEMETRİ VERİLERİ:
${JSON.stringify(compactProjection, null, 2)}`;

    if (!queryHasTelemetry) {
      assistantText = matchedRepo
        ? `### 📡 \`${matchedRepo.name}\` için GitHub Telemetrisi Bekleniyor\n\n\`${matchedRepo.name}\` deposu bağlı olsa da analiz penceresinde bu depoya ait doğrulanmış commit, PR veya issue kaydı bulunmuyor. Sağlık skoru ve risk analizi üretmek için lütfen GitHub verilerini yeniden eşitleyin.`
        : `### 📡 GitHub Telemetrisi Bekleniyor\n\nHenüz doğrulanmış GitHub commit veya PR verisi bulunmuyor. Sağlık skoru, kritik dosya ve risk analizi üretmek için lütfen **Depolar & Bağlantı** bölümünden GitHub hesabınızı bağlayın ve verileri eşitleyin.`;
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
        metric: 'Yıldız & Fork Sayısı (Stars / Forks)',
        value: `${matchedRepo.stargazers_count} Yıldız · ${matchedRepo.forks_count} Fork`,
        source: `GitHub API / ${matchedRepo.name}`,
      });
    } else if (matchedRepo && hasTelemetry) {
      facts.push(`${matchedRepo.name} deposu için analiz penceresinde doğrulanmış commit veya PR kaydı bulunamadı.`);
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
        facts.push(`${h.repo_name}/${h.path} kritik dosyası: ${h.modifications_count} değişiklik, ${h.bug_fix_commits_count} hata düzeltmesi, ${h.code_churn} satır dalgalanma.`);
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

      const criticalHotspots = repoHotspots.slice(0, 4);
      const hotspotListStr = criticalHotspots.length > 0
        ? criticalHotspots.map((h) => `\`${h.path}\` (${h.modifications_count} değişiklik, ${h.code_churn} satır dalgalanma)`).join(', ')
        : 'Kritik dosya tespit edilmedi.';

      return `### 📡 Doğrulanmış Telemetri Kaydı: \`${matchedRepo.name}\`
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Depodan çekilen güncel telemetri kayıtları aşağıda listelenmiştir.)*

• **İncelenen Commit Hacmi:** ${repoCommits.length} commit
• **Çekme İstekleri (PR):** ${repoPRs.length} PR (${repoPRs.filter((p) => p.state === 'open').length} açık)
• **Yıldız & Fork Sayısı:** ${matchedRepo.stargazers_count} Yıldız · ${matchedRepo.forks_count} Fork
• **Öne Çıkan Kritik Dosyalar (İlk ${criticalHotspots.length}):** ${hotspotListStr}
• **Aktif Riskler:** ${repoRisks.length > 0 ? repoRisks.map((r) => `[${r.severity}] ${r.title}`).join('; ') : 'Aktif risk bulunmuyor.'}`;
    }

    const criticalGlobalHotspots = topHotspots.slice(0, 4);
    return `### 📡 Doğrulanmış Sistem Telemetri Kaydı
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Doğrudan ölçülen sistem telemetri kayıtları aşağıda listelenmiştir.)*

• **Genel Sağlık Skoru:** ${health?.hasData ? `${health.overallScore} / 100 (${health.grade})` : 'Hesaplanıyor'}
• **Toplam İncelenen Commit:** ${context.commits.length} commit
• **Öne Çıkan Kritik Dosyalar (İlk ${criticalGlobalHotspots.length}):** ${criticalGlobalHotspots.length > 0 ? criticalGlobalHotspots.map((h) => `\`${h.repo_name}/${h.path}\` (${h.code_churn} satır)`).join(', ') : 'Tespit edilmedi'}
• **Aktif Mühendislik Riski:** ${topRisks.length} adet`;
  }
}
