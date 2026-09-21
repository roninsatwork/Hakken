import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  repoRoot,
  walkFiles,
  relativePath,
  repoTextExtensions,
  walkRepoFiles,
} from './test/driftUtils';

describe('Provider Classification Drift', () => {

  test('new Gemini-era language must be classified before it spreads', () => {
    const allowedGeminiReferenceFiles = new Set([
      'convex/aiModelService.ts',
      'convex/aiModelsActions.ts',
      'convex/aiModelsActions.test.ts',
      'convex/aiModels.test.ts',
      'convex/seedWorkflows.ts',
      'convex/vertexProviderService.ts',
      // Same layer as the adapter above: this is where naming the provider is
      // the point, because the behaviour under test is that provider's.
      'convex/vertexProviderService.test.ts',
      // Names the GEMINI_API_KEY variable that still sits in the Convex
      // deployment. The variable is the fact being documented; the doc cannot
      // describe it without spelling its name.
      'docs/developer/convex-environment-variables.md',
      'docs/plans/completed/code-quality-95-plan.md',
      'docs/developer/future-agent-maintenance-plan.md',
      'docs/index.md',
      'docs/plans/completed/agents-run-properly-plan.md',
      'docs/plans/completed/model-provider-agnostic-plan.md',
      'messages/en.json',
      'messages/it.json',
      // Hakken's product domain is AI visibility across assistants, so the
      // product vision and its market research name Gemini alongside ChatGPT
      // and Perplexity as tracked platforms. Naming them is the subject, not
      // stale platform language.
      'PRODUCT.md',
      'docs/product/ai-visibility-landscape-sept-2026.md',
      'docs/product/app-vision-v2.md',
      'docs/product/data-sources-and-integrations-sept-2026.md',
      'docs/product/research-gaps-closed-sept-2026.md',
      'docs/product/research-note-dooley-search-stack-sept-2026.md',
      // Same reason: this plan lists the AI engines whose answers we track for
      // citations. Naming them is the subject.
      'docs/plans/active/brands-places-and-ai-citations-plan.md',
      'src/provider-classification-drift.test.ts',
    ]);

    const files = walkRepoFiles(repoRoot, repoTextExtensions);
    const geminiReference = /gemini/i;
    const legacyAgentFileReference = /GEMINI\.md/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedGeminiReferenceFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          geminiReference.test(line) && !legacyAgentFileReference.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified Gemini-era references found. Keep actual model IDs/provider docs allowlisted, but rename stale platform language:\n${offenders.join('\n')}`
    ).toEqual([]);
  }, 15_000);


  /**
   * A tool's model-facing name is written down in exactly one place.
   *
   * Until 2026-08-24 a tool reached the model as its routing key with the
   * punctuation swapped for underscores, so "what is this tool called" had two
   * answers and neither field was honest. The fix gave a tool an explicit
   * `modelName`, chosen per tool.
   *
   * The fix only holds if nothing copies that name somewhere else. A tool name
   * written into a prompt, a fixture, a document or a screen goes stale the
   * moment the tool is renamed — and goes stale silently, because nothing
   * checks a string against a database. So the names live in the connector
   * definitions, and everywhere else reads them.
   *
   * This is deliberately a name-by-name check rather than a pattern: a pattern
   * for "looks like a tool name" would match half the codebase.
   */
  test('a tool model name is not hardcoded outside its definition', () => {
    const allowedFiles = new Set([
      // Where the names are chosen. The single source.
      'convex/toolConnectorDefinitions.ts',
      // The backfill that gave existing rows their name, which must name them.
      'convex/dataMigrations.ts',
      // The demo seed builds one tool directly and names it from a constant.
      'convex/localDemoSeed.ts',
      'src/provider-classification-drift.test.ts',
    ]);

    const chosenNames = [
      'describe_scraper_job', 'run_scraper_job', 'read_web_page', 'search_knowledge',
      'update_company_profile', 'create_task', 'call_api', 'send_notification',
      'write_board_report', 'read_customer_record', 'record_customer_detail',
      'read_prospect_group', 'record_prospect_site', 'next_research_task',
      'next_market_discovery_task', 'record_market_group', 'review_market_group',
      'read_market_group_locations', 'record_market_location', 'price_prospects',
      'find_chain_gaps', 'save_report_summary', 'read_mailbox', 'reply_to_email',
    ];

    const files = walkRepoFiles(repoRoot, repoTextExtensions);
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');
      // Tests may name a tool: that is what a fixture is for, and a renamed
      // tool breaking its own test is the system working.
      if (allowedFiles.has(normalizedPath) || /\.test\.[jt]sx?$/.test(normalizedPath)) return [];

      const contents = fs.readFileSync(filePath, 'utf8');
      return chosenNames
        .filter((name) => contents.includes(`"${name}"`) || contents.includes(`'${name}'`))
        .map((name) => `${normalizedPath}: "${name}"`);
    });

    expect(
      offenders,
      `A tool's model-facing name is hardcoded outside its definition. It will go stale silently the next time that tool is renamed — read it from the tool instead:\n${offenders.join('\n')}`
    ).toEqual([]);
  }, 15_000);


  test('provider SDK imports remain classified while adapters mature', () => {
    const allowedProviderSdkImportFiles = new Set([
      // The runtime's model-facing types, in one seam rather than in each file
      // that needs them. `agentRuntime.ts` and `agentObjectiveLoop.ts` both
      // imported them directly until 2026-08-26, and the split that created
      // the second one added it to this list to pass — which the shrink-only
      // rule forbids. Both came off; this went on. Net one shorter.
      'convex/utils/providerContentTypes.ts',
      // Of the four ai.ts successors (2026-08-21 split), only aiSpeech still
      // imports a provider SDK directly (@google/genai Modality for TTS).
      'convex/aiSpeech.ts',
      // Adapters are where provider SDK usage belongs.
      'convex/googleAgentProvider.ts',
      'convex/googleProviderAdapter.ts',
      'convex/orchestrator.ts',
      'convex/salesReportActions.ts',
      'convex/swarmActions.ts',
      'convex/vertexProviderService.test.ts',
      'convex/vertexProviderService.ts',
      'src/provider-classification-drift.test.ts',
    ]);

    const files = [
      ...walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts'])),
      ...walkFiles(path.join(repoRoot, 'src'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !relativePath(filePath).replaceAll(path.sep, '/').includes('/_generated/'));
    const providerSdkImport = /from\s+["']@google\/genai["']|new\s+GoogleGenAI\s*\(/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedProviderSdkImportFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          providerSdkImport.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified provider SDK imports found. Keep provider SDK usage in adapters or explicitly classified transitional runtime files:\n${offenders.join('\n')}`
    ).toEqual([]);
  });


  test('raw provider model calls stay behind retry wrappers', () => {
    const allowedRawProviderCallFiles = new Set([
      'convex/vertexProviderService.ts',
      'src/provider-classification-drift.test.ts',
    ]);

    const files = [
      ...walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts'])),
      ...walkFiles(path.join(repoRoot, 'src'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !relativePath(filePath).replaceAll(path.sep, '/').includes('/_generated/'));
    const rawProviderCall = /\b(?:ai|client)\.models\.(?:generateContent|embedContent)\s*\(/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedRawProviderCallFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          rawProviderCall.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Raw provider model calls must go through retry wrappers before they reach provider SDKs:\n${offenders.join('\n')}`
    ).toEqual([]);
  });


  test('provider model ID literals remain classified', () => {
    const allowedProviderModelLiteralFiles = new Set([
      'convex/aiModelService.ts',
      'convex/aiModelService.test.ts',
      'convex/aiModels.test.ts',
      'convex/aiModelsActions.test.ts',
      'convex/aiModelsActions.ts',
      'convex/anthropicAgentProvider.test.ts',
      'convex/anthropicProviderService.test.ts',
      'convex/googleAgentProvider.test.ts',
      'convex/openrouterAgentProvider.test.ts',
      'convex/chat.test.ts',
      'convex/globalSystems.test.ts',
      'convex/knowledge.test.ts',
      'convex/openaiProviderService.test.ts',
      'convex/seedWorkflows.ts',
      'convex/vertexProviderService.ts',
      'docs/plans/completed/model-provider-agnostic-plan.md',
      'docs/product/ai-visibility-landscape-sept-2026.md',
      'src/app/(dashboard)/admin/ai/costs/_components/AICostCharts.test.tsx',
      'src/provider-classification-drift.test.ts',
    ]);

    const providerModelLiteral = /\b(?:gemini-[a-z0-9.-]+|text-embedding-\d(?:-[a-z]+)?|gpt-[a-z0-9.-]+|claude-[a-z0-9.-]+)\b/;
    const files = walkRepoFiles(repoRoot, repoTextExtensions);
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedProviderModelLiteralFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          providerModelLiteral.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified provider model ID literals found. Store runtime model choices in the model catalogue/defaults instead of hardcoding IDs:\n${offenders.join('\n')}`
    ).toEqual([]);
  }, 15_000);
});
