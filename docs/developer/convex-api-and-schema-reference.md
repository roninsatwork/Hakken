---
product: Hakken
documentation_type: Developer reference
feature_area: Convex API and schema locations
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/convex-api-and-schema-reference.md
last_reviewed: '2026-10-26T15:14:21+00:00'
reviewed_against: current implementation
status: Current
---
# Convex API And Schema Reference

> **Product:** Hakken · **Document type:** Developer reference · **Feature area:** Convex API and schema locations
> **Reviewed:** 26 October 2026, 15:14:21 GMT (Europe/London)
> **Source path:** `docs/developer/convex-api-and-schema-reference.md` · **Status:** Current

This technical lookup records current top-level Convex function entry points and table declaration locations found by static source inspection. It complements the feature guides rather than certifying every exported symbol's behavior. [The central inventory](../index.md#documentation-coverage-inventory) remains the coverage record. A module/table listed here is not automatically a delivered product capability, a live API acceptance result, or a public endpoint.

## Read The Wrapper Before Calling A Function

Queries read database state, mutations own transactional writes, and actions orchestrate provider/network work and separately invoked database operations. `internalQuery`, `internalMutation`, and `internalAction` denote backend-only entry points; `httpAction` belongs to an HTTP routing surface. Custom wrappers in `tenantFunctions.ts` add session, role, company, module or public-credential contracts. Their names are useful evidence, but handlers and helpers still need review before describing exact access.

A tenant wrapper is not permission to accept any client-supplied company ID. Company holdings, thread ownership, active workspace and feature-specific scopes matter. Platform-reader and auditor permissions differ from write authority. Soft queries can return empty unauthenticated states but still need appropriate signed-in checks. The documented rule-list and subject-access discrepancies must not be hidden by calling the whole backend uniformly isolated.

Function export discovery below recognizes an exported constant initialized with an object-form query/mutation/action wrapper. Utility functions, services, constants, function factories and generated client aliases are outside that mechanical list. This is deliberately explicit about the discovery method, avoiding a claim that regex proves complete executable semantics. The source module link is the entry for inspecting argument/return validators, helper calls and relevant tests.

## Current Function Modules

This pass found 2099 recognized registered exports across 430 top-level modules. Multiple exports can serve one coherent capability.

| Source module | Registered exports and wrappers |
| --- | --- |
| [agentEvalFixtures.ts](../../convex/agentEvalFixtures.ts) | `createFromRun` (adminMutation); `createManual` (adminMutation); `updateFixture` (adminMutation); `archiveFixture` (adminMutation); `runSmokeEval` (adminMutation); `runEvalSuite` (adminMutation); `listSuitePresets` (adminQuery); `getReleaseCandidateComparison` (adminQuery); `saveSuitePreset` (adminMutation); `archiveSuitePreset` (adminMutation); `getFixtureForRehearsalInternal` (internalQuery); `runRehearsalEval` (adminMutation); `createEvalThreadInternal` (internalMutation); `getEvalThreadOutcomeInternal` (internalQuery); `getSmokeEvalGradingContextInternal` (internalQuery); `completeModelGradedSmokeEvalInternal` (internalMutation); `getForRun` (adminQuery); `getCheckDetail` (adminQuery); `getSmokeEvalHistory` (adminQuery); `getRecentForAgent` (adminQuery) |
| [agentEvalGradingActions.ts](../../convex/agentEvalGradingActions.ts) | `gradeSmokeEvalWithModel` (internalAction); `runRehearsalEvalInternal` (internalAction) |
| [agentImprovementSuggestions.ts](../../convex/agentImprovementSuggestions.ts) | `generateForRun` (adminMutation); `decideSuggestion` (adminMutation); `getRecentForAgent` (adminQuery); `getForRun` (adminQuery) |
| [agentInventory.ts](../../convex/agentInventory.ts) | `getAgentFilterCounts` (superAdminQuery) |
| [agentLogs.ts](../../convex/agentLogs.ts) | `getJobGroups` (adminQuery); `seedForAgent` (internalMutation); `insertAgentLogInternal` (internalMutation); `getForRun` (adminQuery); `getLogById` (adminQuery); `deleteLog` (adminMutation) |
| [agentMemories.ts](../../convex/agentMemories.ts) | `getForAgent` (adminQuery); `deleteMemory` (adminMutation); `getQualityForAgent` (adminQuery); `getAlwaysMemoriesInternal` (internalQuery); `searchMemoryInternal` (internalQuery); `recordUsageInternal` (internalMutation); `createMemory` (adminMutation); `updateMemory` (adminMutation); `restoreMemory` (adminMutation) |
| [agentMemoryCandidates.ts](../../convex/agentMemoryCandidates.ts) | `generateForRun` (adminMutation); `generateForRunInternal` (internalMutation); `decideCandidate` (adminMutation); `getForRun` (adminQuery); `getRecentForAgent` (adminQuery); `getReviewInboxForAgent` (adminQuery) |
| [agentRoles.ts](../../convex/agentRoles.ts) | `listAgentRoleHolders` (superAdminQuery) |
| [agentRunApprovals.ts](../../convex/agentRunApprovals.ts) | `getPendingApprovals` (superAdminQuery); `getPendingApprovalCount` (superAdminQuery); `decideApproval` (superAdminMutation); `insertApprovalInternal` (internalMutation); `getApprovalResumeContextInternal` (internalQuery); `recordApprovedToolResultInternal` (internalMutation); `getApprovalExpiryConfig` (superAdminQuery); `updateApprovalExpiryConfig` (superAdminMutation); `expireStalePendingApprovals` (internalMutation); `getSettlementAfterDecisionInternal` (internalQuery); `continueRunAfterApprovalInternal` (internalMutation); `completeApprovalResumeInternal` (internalMutation) |
| [agentRunCheckpoints.ts](../../convex/agentRunCheckpoints.ts) | `getCheckpointInternal` (internalQuery); `saveCheckpointInternal` (internalMutation); `clearCheckpointInternal` (internalMutation); `reactivateCheckpointInternal` (internalMutation); `recoverStalledRuns` (internalMutation) |
| [agentRunFeedback.ts](../../convex/agentRunFeedback.ts) | `upsertForRun` (adminMutation); `upsertForRunAsEndUser` (tenantMutation); `getForRun` (adminQuery); `getMineForAgent` (adminQuery) |
| [agentRunReflections.ts](../../convex/agentRunReflections.ts) | `createForRun` (adminMutation); `createForRunInternal` (internalMutation); `dismissReflection` (adminMutation); `getForRun` (adminQuery); `getRecentForAgent` (adminQuery) |
| [agentRuns.ts](../../convex/agentRuns.ts) | `getPageForAgent` (adminQuery); `getForAgent` (adminQuery); `getWorkingAgentIds` (adminQuery); `getRunDetail` (adminQuery); `getPublicRunStatusInternal` (internalQuery); `getReplayExecutionContextInternal` (internalQuery); `getToolCallRecordsForRunInternal` (internalQuery); `getLatestStepIndexInternal` (internalQuery); `getRunExecutionStateInternal` (internalQuery); `getAnalyticsForAgent` (adminQuery); `getRunObservatory` (adminQuery); `replayRun` (adminMutation); `cancelRun` (adminMutation); `createRunInternal` (internalMutation); `createPublicAgentRunInternal` (internalMutation); `updateRunStatusInternal` (internalMutation); `recordRunUsageInternal` (internalMutation); `appendStepInternal` (internalMutation); `insertToolCallInternal` (internalMutation) |
| [agentRuntime.ts](../../convex/agentRuntime.ts) | `runAgentObjective` (internalAction); `continueAgentObjective` (internalAction); `runTriggeredAgentObjective` (internalAction); `resumeApprovedToolCall` (internalAction); `resumeAfterRefusedToolCall` (internalAction); `executeAgentNode` (internalAction) |
| [agentSkills.ts](../../convex/agentSkills.ts) | `previewSkillMarkdownImport` (superAdminMutation); `getPaginatedSkills` (superAdminQuery); `getActiveSkills` (superAdminQuery); `searchActiveSkills` (superAdminQuery); `getSkillCatalogAnalytics` (superAdminQuery); `rebuildSkillCatalogRollup` (superAdminMutation); `rebuildSkillCatalogRollupInternal` (internalMutation); `getSkill` (superAdminQuery); `exportSkillBundle` (superAdminQuery); `getSkillLearningAnalytics` (superAdminQuery); `getBindingsForSkill` (superAdminQuery); `createSkill` (superAdminMutation); `seedStarterSkills` (superAdminMutation); `updateSkill` (superAdminMutation); `cloneSkill` (superAdminMutation); `importSkillBundle` (superAdminMutation); `importSkillMarkdown` (superAdminMutation); `deleteSkill` (superAdminMutation); `archiveSkill` (superAdminMutation); `getForAgent` (adminQuery); `upgradeSkillBindingToLatest` (superAdminMutation); `upgradeSkillBindingsForSkill` (superAdminMutation); `bindSkillToAgent` (superAdminMutation); `setBindingEnabled` (superAdminMutation); `unbindSkillFromAgent` (superAdminMutation); `getRuntimeSkillsInternal` (internalQuery) |
| [agentTransactions.ts](../../convex/agentTransactions.ts) | `getForAgent` (adminQuery); `getStatsForAgent` (adminQuery); `seedForAgent` (internalMutation); `insertTransactionInternal` (internalMutation) |
| [agentVersions.ts](../../convex/agentVersions.ts) | `createSnapshot` (adminMutation); `getForAgent` (adminQuery); `getVersionDetail` (adminQuery) |
| [agents.ts](../../convex/agents.ts) | `list` (superAdminQuery); `getInheritedAgentModels` (superAdminQuery); `getPaginatedAgents` (superAdminQuery); `get` (superAdminQuery); `getAgentReadiness` (adminQuery); `createAgent` (superAdminMutation); `getAgentTemplatesForCreation` (superAdminQuery); `createAgentFromTemplate` (superAdminMutation); `updateAgent` (superAdminMutation); `deleteAgent` (superAdminMutation); `getAgentInternal` (internalQuery); `getAgentToolsInternal` (internalQuery); `getForCompanyInternal` (internalQuery); `createInlineAgent` (superAdminMutation); `promoteToGlobal` (superAdminMutation) |
| [aiActionRequests.ts](../../convex/aiActionRequests.ts) | `reserve` (internalMutation) |
| [aiAnswerExtras.ts](../../convex/aiAnswerExtras.ts) | `writeAnswerExtras` (internalMutation) |
| [aiChat.ts](../../convex/aiChat.ts) | `generateThreadTitle` (internalAction) |
| [aiDemand.ts](../../convex/aiDemand.ts) | `writeAiDemand` (internalMutation) |
| [aiModels.ts](../../convex/aiModels.ts) | `getModels` (tenantQuery); `getModelPickerOptions` (tenantQuery); `getActiveModels` (tenantQuery); `getPaginatedModels` (superAdminQuery); `getModelCounts` (superAdminQuery); `getProviders` (superAdminQuery); `getProviderDefaultUsage` (superAdminQuery); `setProviderEnabled` (superAdminMutation); `getGlobalModelDefaults` (superAdminQuery); `setGlobalModelDefault` (superAdminMutation); `clearGlobalModelDefault` (superAdminMutation); `internalUpdateProviderHealth` (internalMutation); `resolveModelConfigForExecution` (internalQuery); `resolveModelForExecution` (internalQuery); `getCompanyModelDefaults` (superAdminQuery); `setCompanyModelDefault` (superAdminMutation); `clearCompanyModelDefault` (superAdminMutation); `resolveEmbeddingModelConfigForExecution` (internalQuery); `toggleModelEnforcement` (superAdminMutation); `setDefaultModel` (superAdminMutation); `internalBatchUpsert` (internalMutation); `backfillModelSearchText` (internalMutation); `backfillGoogleVertexModelProviders` (internalMutation); `getModel` (tenantQuery); `updatePricingConfig` (superAdminMutation); `getModelByIdInternal` (internalQuery); `getEnabledModelIdsInternal` (internalQuery); `getEnabledTextModelIdsInternal` (internalQuery); `getAllModelsInternal` (internalQuery) |
| [aiModelsActions.ts](../../convex/aiModelsActions.ts) | `syncGoogleModels` (superAdminAction); `syncOpenAIModels` (superAdminAction); `syncOpenRouterModels` (superAdminAction); `syncAnthropicModels` (superAdminAction); `syncTypesafeModels` (superAdminAction); `syncVertexModels` (superAdminAction); `probeProviderInternal` (internalAction); `testProviderConnection` (superAdminAction) |
| [aiOverviewFanOuts.ts](../../convex/aiOverviewFanOuts.ts) | `writeAiOverviewFanOuts` (internalMutation) |
| [aiRules.ts](../../convex/aiRules.ts) | `getRules` (softQuery); `getOffsetPaginatedRules` (softQuery); `getActiveRulesInternal` (internalQuery); `seedPricingRule` (internalMutation); `getRuleById` (tenantQuery); `createRule` (tenantMutation); `updateRule` (tenantMutation); `toggleRuleActive` (tenantMutation); `deleteRule` (tenantMutation) |
| [aiSpeech.ts](../../convex/aiSpeech.ts) | `transcribeAudio` (tenantAction); `synthesizeSpeech` (tenantAction) |
| [aiToolNotificationTools.ts](../../convex/aiToolNotificationTools.ts) | `getTenantNotificationRecipients` (internalQuery); `recordNotificationDispatch` (internalMutation); `getConnectorSecretRefsForTool` (internalQuery) |
| [aiToolReadTools.ts](../../convex/aiToolReadTools.ts) | `searchKnowledge` (internalQuery) |
| [aiToolWriteTools.ts](../../convex/aiToolWriteTools.ts) | `updateCompanyOverview` (internalMutation); `purgeExpiredToolIdempotency` (internalMutation) |
| [aiTools.ts](../../convex/aiTools.ts) | `getConnectorMarketplace` (adminQuery); `installConnector` (superAdminMutation); `getConnectorInstallDetails` (adminQuery); `beginConnectorOAuth` (adminMutation); `disconnectConnectorOAuth` (adminMutation); `updateConnectorInstall` (adminMutation); `validateConnectorConfiguration` (adminMutation); `getTools` (superAdminQuery); `getPaginatedTools` (superAdminQuery); `getToolById` (superAdminQuery); `createTool` (superAdminMutation); `updateTool` (superAdminMutation); `deleteTool` (superAdminMutation); `getAgentTools` (superAdminQuery); `toggleAgentTool` (superAdminMutation); `getToolInternal` (internalQuery); `getToolShelf` (superAdminQuery) |
| [aiVoiceSession.ts](../../convex/aiVoiceSession.ts) | `searchKnowledgeForVoice` (tenantAction); `searchKnowledgeForVoiceInternal` (internalAction); `createVoiceTicketForCompany` (internalAction); `createRealtimeVoiceSession` (tenantAction) |
| [analytics.ts](../../convex/analytics.ts) | `getGlobalAICosts` (superAdminQuery); `getPlatformOverview` (superAdminQuery); `getUserCostOverview` (adminQuery); `getUserCostThreads` (adminQuery); `getCompanyMetrics` (adminQuery); `getGlobalInventoryMetrics` (superAdminQuery); `getGlobalAnalytics` (superAdminQuery); `debugTime` (internalQuery); `debugDb` (internalQuery) |
| [analyticsSnapshots.ts](../../convex/analyticsSnapshots.ts) | `backfillMessageAnalyticsDimensions` (internalMutation); `validateMessageAnalyticsDimensions` (internalQuery); `snapshotDateAlreadyGenerated` (internalQuery); `readSnapshotModelCatalogue` (internalQuery); `readDayInteractionsPage` (internalQuery); `readSnapshotJoins` (internalQuery); `writeDailySnapshots` (internalMutation); `generateDailySnapshots` (internalAction); `seedHistoricalSnapshots` (internalAction); `wipeSnapshots` (internalMutation) |
| [apiKeys.ts](../../convex/apiKeys.ts) | `list` (adminQuery); `create` (adminMutation); `revoke` (adminMutation); `authenticatePublicRequest` (internalMutation) |
| [apify.ts](../../convex/apify.ts) | `startApifyActorInternal` (internalAction); `describeApifyActorInternal` (internalAction); `pollRunStatus` (internalAction); `fetchDatasetAndStore` (internalAction); `syncRunStatus` (tenantAction); `syncRunStatusInternal` (internalAction); `debugDatasetItem` (tenantAction) |
| [arcade.ts](../../convex/arcade.ts) | `getPaginatedLeaderboard` (tenantQuery); `getScoresCount` (tenantQuery); `submitScore` (tenantMutation); `getNightHeistProgress` (tenantQuery); `startNightHeistRun` (tenantMutation); `finishNightHeistRun` (tenantMutation) |
| [assetSummaries.ts](../../convex/assetSummaries.ts) | `rebuildAssets` (internalMutation); `rebuildCompanyAssets` (internalMutation) |
| [assistantAnalyticsReads.ts](../../convex/assistantAnalyticsReads.ts) | `googleAnalyticsInternal` (internalQuery); `liveHoldInternal` (internalQuery); `googleAnalyticsLiveInternal` (internalAction) |
| [assistantBingReads.ts](../../convex/assistantBingReads.ts) | `bingWebmasterInternal` (internalQuery) |
| [assistantReads.ts](../../convex/assistantReads.ts) | `adviceInternal` (internalQuery); `insightsInternal` (internalQuery); `websitesInternal` (internalQuery); `siteOverviewInternal` (internalQuery); `searchConsoleInternal` (internalQuery); `aiMentionsInternal` (internalQuery); `openTasksInternal` (internalQuery) |
| [assistantReplyExtras.ts](../../convex/assistantReplyExtras.ts) | `runExtrasInternal` (internalQuery) |
| [auditLogs.ts](../../convex/auditLogs.ts) | `logAction` (internalMutation); `getRecentLogs` (softQuery); `getAuditPage` (publicQuery); `getAuditFilterOptions` (publicQuery); `getAuditExport` (publicMutation); `getAuditEntry` (publicQuery) |
| [auth.ts](../../convex/auth.ts) | `signIn` (publicAction) |
| [authEvents.ts](../../convex/authEvents.ts) | `canStartEmailSignIn` (internalQuery); `reserveAuthEmailSend` (internalMutation); `getRecentAuthEvents` (adminQuery); `recordMagicLinkRequestAttempt` (publicMutation) |
| [autoClassifyRun.ts](../../convex/autoClassifyRun.ts) | `sortStep` (internalAction) |
| [autoClassifyStart.ts](../../convex/autoClassifyStart.ts) | `ensureAutoClassifierInternal` (internalMutation); `startAutoClassify` (superAdminMutation); `startForWebsite` (internalMutation); `autoClassifyStatus` (superAdminQuery); `websitesWithGroups` (internalQuery); `runAutoClassifyNow` (internalAction); `carryOnStalled` (internalMutation); `watchAutoClassify` (internalAction) |
| [autoClassifySteps.ts](../../convex/autoClassifySteps.ts) | `chargeAnswersToRun` (internalMutation); `stepWork` (internalQuery); `writeAnswers` (internalMutation); `saveDescription` (internalMutation); `noteStep` (internalMutation); `finishSiteRun` (internalMutation) |
| [autoSetupRun.ts](../../convex/autoSetupRun.ts) | `setupStep` (internalAction) |
| [autoSetupStart.ts](../../convex/autoSetupStart.ts) | `ensureAutoSetupInternal` (internalMutation); `startAutoSetup` (superAdminMutation); `autoSetupStatus` (superAdminQuery); `answerAgentsRun` (internalMutation); `carryOnStalled` (internalMutation); `watchAutoSetup` (internalAction); `dayBudgetNow` (internalQuery) |
| [autoSetupSteps.ts](../../convex/autoSetupSteps.ts) | `stepWork` (internalQuery); `noteStep` (internalMutation); `stepProgress` (internalMutation); `skipOwn` (internalMutation); `writeOwnProfile` (internalMutation); `writeOwnLists` (internalMutation); `writeRivalNames` (internalMutation); `finishCompanyRun` (internalMutation); `rivalRankings` (internalQuery); `fileBoughtRankings` (internalMutation); `leftForPerson` (internalQuery) |
| [billing.ts](../../convex/billing.ts) | `getStatus` (softQuery) |
| [billingActions.ts](../../convex/billingActions.ts) | `createCheckout` (adminAction); `createPortal` (adminAction); `refresh` (adminAction) |
| [billingAdmin.ts](../../convex/billingAdmin.ts) | `getSettings` (superAdminQuery); `getPlan` (superAdminQuery); `getCompany` (superAdminQuery); `listCompanies` (superAdminQuery) |
| [billingAdminActions.ts](../../convex/billingAdminActions.ts) | `saveSettings` (superAdminAction); `listPrices` (superAdminAction); `linkPrice` (superAdminAction); `checkConnection` (superAdminAction) |
| [billingConfiguration.ts](../../convex/billingConfiguration.ts) | `read` (internalQuery); `publish` (internalMutation); `recordWebhook` (internalMutation) |
| [billingMetrics.ts](../../convex/billingMetrics.ts) | `accountsPage` (internalQuery); `usersPage` (internalQuery); `companiesPage` (internalQuery); `overview` (superAdminAction) |
| [billingRecovery.ts](../../convex/billingRecovery.ts) | `attachProviderObject` (internalAction) |
| [billingState.ts](../../convex/billingState.ts) | `acquire` (internalMutation); `release` (internalMutation); `bindCustomer` (internalMutation); `findCustomer` (internalQuery); `getAttempt` (internalQuery); `getOffers` (internalQuery); `createAttempt` (internalMutation); `saveSession` (internalMutation); `applyProjection` (internalMutation); `expireAccess` (internalMutation) |
| [billingSync.ts](../../convex/billingSync.ts) | `reconcile` (internalAction); `scheduleReconciliation` (internalMutation) |
| [bingWebmasterAgentRun.ts](../../convex/bingWebmasterAgentRun.ts) | `agentCollections` (internalQuery); `runBingCollectorNow` (internalAction); `startSiteRun` (internalMutation); `startFirstCollection` (internalMutation) |
| [bingWebmasterBook.ts](../../convex/bingWebmasterBook.ts) | `bookChunk` (internalQuery); `addToBingBook` (internalMutation) |
| [bingWebmasterCollect.ts](../../convex/bingWebmasterCollect.ts) | `collectTarget` (internalQuery); `writeDays` (internalMutation); `weekHashes` (internalQuery); `writeWeek` (internalMutation); `weekParts` (internalQuery); `dropOldWeeks` (internalMutation); `googleFigures` (internalQuery); `writePeriodParts` (internalMutation); `dropOlderPeriods` (internalMutation); `moneyPages` (internalQuery); `savePageChecks` (internalMutation); `finishCollection` (internalMutation); `releaseRun` (internalMutation); `dropLive` (internalMutation); `clearFigures` (internalMutation); `purgeHold` (internalMutation) |
| [bingWebmasterConnect.ts](../../convex/bingWebmasterConnect.ts) | `beginBingConnect` (adminMutation); `pendingByState` (internalQuery); `recordAttempt` (internalMutation); `completeSignIn` (internalMutation); `chooseBingSite` (adminMutation); `disconnectBing` (adminMutation); `noteProblem` (internalMutation); `tokenRowOf` (internalQuery); `storeRenewedToken` (internalMutation); `dropTokens` (internalMutation); `bingStatus` (tenantQuery) |
| [bingWebmasterReads.ts](../../convex/bingWebmasterReads.ts) | `bingSites` (tenantQuery); `bingPerformance` (tenantQuery); `bingListPage` (tenantQuery); `bingListAll` (tenantQuery); `bingRecord` (tenantQuery); `bingLiveRows` (tenantQuery); `liveTarget` (internalQuery); `keepLive` (internalMutation); `askBingLive` (tenantAction); `bingCrawling` (tenantQuery) |
| [brandRadar.ts](../../convex/brandRadar.ts) | `writeChatGptRadar` (internalMutation); `writeRadar` (internalMutation) |
| [chat.ts](../../convex/chat.ts) | `getThreads` (tenantQuery); `getMessages` (publicQuery); `setAssistantStage` (internalMutation); `getAssistantStage` (publicQuery); `getThreadHeading` (tenantQuery); `getConversationClient` (tenantQuery); `getMessagesForAI` (internalQuery); `getThreadInternal` (internalQuery); `generateChatUploadUrl` (tenantMutation); `createThread` (tenantMutation); `sendMessage` (publicMutation); `saveAssistantMessage` (internalMutation); `startStreamingAssistantMessage` (internalMutation); `appendStreamingAssistantMessage` (internalMutation); `finishStreamingAssistantMessage` (internalMutation); `saveAssistantSafetyRefusal` (internalMutation); `deleteThread` (tenantMutation); `renameThread` (tenantMutation); `renameThreadInternal` (internalMutation); `recordVoiceTurn` (tenantMutation); `recordVoiceUsage` (tenantMutation); `getAttachmentContentTypesInternal` (internalQuery); `saveAssistantNoticeInternal` (internalMutation) |
| [chatAdmin.ts](../../convex/chatAdmin.ts) | `getOffsetPaginatedThreads` (superAdminQuery); `getOffsetPaginatedCompanyThreads` (adminQuery); `getPaginatedThreads` (superAdminQuery); `getPaginatedCompanyThreads` (adminQuery); `getCompanyThreadById` (adminQuery); `getAdminThreadDecisions` (adminQuery); `getAdminThreadMessages` (adminQuery) |
| [clarity.ts](../../convex/clarity.ts) | `clarityStatus` (tenantQuery); `claritySites` (tenantQuery); `connectClarity` (adminAction); `canConnect` (internalQuery); `saveConnection` (internalMutation); `disconnectClarity` (tenantMutation); `saveDay` (internalMutation); `saveRecordings` (internalMutation); `rebuildFigures` (internalMutation); `buildSpan` (internalMutation); `tidyFigures` (internalMutation) |
| [clarityAgentRun.ts](../../convex/clarityAgentRun.ts) | `ensureClarityCollectorInternal` (internalMutation); `agentCollections` (internalQuery); `runClarityCollectorNow` (internalAction); `startSiteRun` (internalMutation); `startFirstCollection` (internalMutation); `sitePlan` (internalQuery); `takeAsks` (internalMutation); `countAsks` (internalMutation); `noteRefused` (internalMutation); `doneCollecting` (internalMutation); `collectClaritySite` (internalAction) |
| [clarityScreens.ts](../../convex/clarityScreens.ts) | `clarityOverview` (tenantQuery); `clarityPagesList` (tenantQuery); `clarityPagesAll` (tenantQuery); `clarityPage` (tenantQuery); `clarityErrors` (tenantQuery); `clarityRecordingsList` (tenantQuery) |
| [classificationTypes.ts](../../convex/classificationTypes.ts) | `classificationTypeChoices` (superAdminQuery); `classificationTypeList` (superAdminQuery); `classificationTypeDetail` (superAdminQuery); `saveClassificationType` (superAdminMutation); `removeClassificationType` (superAdminMutation) |
| [collectionAlerts.ts](../../convex/collectionAlerts.ts) | `noteCollectorNeedsYou` (internalMutation) |
| [collectionParts.ts](../../convex/collectionParts.ts) | `getCollectionParts` (superAdminQuery); `setCollectionParts` (superAdminMutation) |
| [collectionRehearsal.ts](../../convex/collectionRehearsal.ts) | `seedRehearsal` (internalMutation); `linkRehearsalSignIn` (internalMutation); `startRehearsalRuns` (internalMutation); `startRehearsal` (internalAction); `rehearsalReport` (internalQuery); `rehearsalToEnd` (internalQuery); `endRehearsal` (internalAction); `finishEnding` (internalMutation) |
| [collectionSteps.ts](../../convex/collectionSteps.ts) | `handOn` (internalMutation); `startChain` (internalMutation); `stepStarted` (internalMutation); `notePlace` (internalMutation); `closeChain` (internalMutation); `watchChains` (internalMutation) |
| [companies.ts](../../convex/companies.ts) | `getCompanies` (superAdminQuery); `getPaginatedCompanies` (superAdminQuery); `getCompanyOptions` (superAdminQuery); `getCompanyById` (superAdminQuery); `getMyWorkspaceModules` (tenantQuery); `getPlanGrantsForCompany` (superAdminQuery); `getCompanyByIdInternal` (internalQuery); `createCompany` (superAdminMutation); `updateCompany` (superAdminMutation); `setCompanyModules` (superAdminMutation); `deleteCompany` (superAdminMutation); `updateCompanyPrompt` (superAdminMutation); `updateCompanyDescription` (superAdminMutation); `updateCompanyProfile` (superAdminMutation); `assignPlanToCompany` (superAdminMutation); `purgeCompanyEntitiesInternal` (internalMutation) |
| [companyAiLists.ts](../../convex/companyAiLists.ts) | `companyAiListCounts` (superAdminQuery); `listCompanyQuestions` (superAdminQuery); `listCompanySearches` (superAdminQuery); `listCompanyFanOut` (superAdminQuery) |
| [companyDataLimits.ts](../../convex/companyDataLimits.ts) | `setCompanyDataLimits` (superAdminMutation); `setSiteDataLimits` (superAdminMutation) |
| [companyEngagement.ts](../../convex/companyEngagement.ts) | `getCompanyEngagement` (adminQuery) |
| [companyEvalRunActions.ts](../../convex/companyEvalRunActions.ts) | `runCompanyCheck` (internalAction) |
| [companyEvalRuns.ts](../../convex/companyEvalRuns.ts) | `runCheck` (adminAction); `runBatch` (adminAction) |
| [companyEvals.ts](../../convex/companyEvals.ts) | `getSummary` (adminQuery); `getCasesForCompany` (adminQuery); `getCaseById` (adminQuery); `getRunsForCase` (adminQuery); `createCase` (adminMutation); `updateCase` (adminMutation); `createStarterCases` (adminMutation); `deleteCase` (adminMutation); `createEvalThreadInternal` (internalMutation); `getEvalThreadOutcomeInternal` (internalQuery); `getBatchEstimate` (adminQuery); `getBatchCaseIdsInternal` (internalQuery); `getCaseForRunInternal` (internalQuery); `recordGradedRunInternal` (internalMutation) |
| [companyLearningLoop.ts](../../convex/companyLearningLoop.ts) | `getSuggestionsForCompany` (adminQuery); `createMemoryCandidateFromChat` (adminMutation); `createEvalCaseFromChat` (adminMutation) |
| [companyMemories.ts](../../convex/companyMemories.ts) | `getSummary` (adminQuery); `getPreviewForCompany` (adminQuery); `getMemoryById` (adminQuery); `getRuntimeMemoriesInternal` (internalQuery); `getAlwaysMemoriesInternal` (internalQuery); `recordRuntimeUsageInternal` (internalMutation); `getForCompany` (adminQuery); `getCandidatesForCompany` (adminQuery); `createMemory` (adminMutation); `updateMemory` (adminMutation); `archiveMemory` (adminMutation); `restoreMemory` (adminMutation); `proposeCorrectionCandidate` (internalMutation); `createCandidate` (adminMutation); `approveCandidate` (adminMutation); `rejectCandidate` (adminMutation) |
| [companyMemorySuggestionActions.ts](../../convex/companyMemorySuggestionActions.ts) | `sweepDispatcher` (internalAction); `sweepCompany` (internalAction) |
| [companyMemorySuggestions.ts](../../convex/companyMemorySuggestions.ts) | `listCompaniesToSweepInternal` (internalQuery); `getSweepInputInternal` (internalQuery); `recordSweepInternal` (internalMutation) |
| [companyReadiness.ts](../../convex/companyReadiness.ts) | `getCompanyAiReadiness` (adminQuery); `resolveDriftEvents` (adminMutation) |
| [companySkills.ts](../../convex/companySkills.ts) | `getSummary` (adminQuery); `getRuntimePreviewForCompany` (adminQuery); `getSkillsForCompany` (adminQuery); `searchImportableGlobalSkills` (adminQuery); `getRuntimeCompanySkillsInternal` (internalQuery); `getImportableGlobalSkills` (adminQuery); `getBindingsForSkill` (adminQuery); `createSkill` (adminMutation); `importGlobalSkill` (adminMutation); `updateSkill` (adminMutation); `archiveSkill` (adminMutation); `setBinding` (adminMutation) |
| [connectionProbes.ts](../../convex/connectionProbes.ts) | `listProbeTargetsInternal` (internalQuery); `recordConnectorProbeInternal` (internalMutation); `probeConnections` (internalAction); `listConnections` (adminQuery); `probeConnectionsNow` (superAdminAction) |
| [connectorOAuth.ts](../../convex/connectorOAuth.ts) | `getPendingConnectionByState` (internalQuery); `markConnectionError` (internalMutation); `finalizeConnection` (internalMutation); `getConnectorAccessToken` (internalAction); `readTokenRow` (internalQuery); `storeRefreshedToken` (internalMutation); `markConnectionDead` (internalMutation); `revokeAndDisconnect` (internalAction); `completeDisconnect` (internalMutation); `refreshExpiringTokens` (internalAction); `listExpiringTokenRows` (internalQuery) |
| [contentTranslation.ts](../../convex/contentTranslation.ts) | `ensureTranslatorInternal` (internalMutation); `sourceForInternal` (internalQuery); `saveTranslationInternal` (internalMutation); `missingTranslationsInternal` (internalQuery) |
| [contentTranslationActions.ts](../../convex/contentTranslationActions.ts) | `translateNow` (internalAction); `runTranslatorNow` (internalAction) |
| [creditCorrections.ts](../../convex/creditCorrections.ts) | `raisePlanCredits` (internalMutation); `recountCollectionCredits` (internalMutation); `recountAnswers` (internalMutation); `recountRequests` (internalMutation); `recountCharges` (internalMutation) |
| [creditLedger.ts](../../convex/creditLedger.ts) | `sweepCreditLedger` (internalMutation) |
| [creditPricesAdmin.ts](../../convex/creditPricesAdmin.ts) | `creditPriceReport` (superAdminQuery); `saveCreditPrices` (superAdminMutation) |
| [creditUsage.ts](../../convex/creditUsage.ts) | `usageSummary` (tenantQuery); `usageComingUp` (tenantQuery); `usageStatement` (tenantQuery); `usageStatementTotals` (tenantQuery) |
| [dataMigrations.ts](../../convex/dataMigrations.ts) | `run` (internalMutation); `processBatch` (internalMutation); `getStatus` (superAdminQuery); `listStatus` (superAdminQuery) |
| [decisionRuns.ts](../../convex/decisionRuns.ts) | `ensureDecisionAgentInternal` (internalMutation); `resolveModesInternal` (internalQuery); `listRegisteredInternal` (internalQuery); `recordRunsInternal` (internalMutation) |
| [decisions.ts](../../convex/decisions.ts) | `listForPlatform` (superAdminQuery); `listForCompany` (adminQuery); `setPlatformMode` (superAdminMutation); `setCompanyMode` (adminMutation); `detailForPlatform` (superAdminQuery); `detailForCompany` (adminQuery); `listForRun` (adminQuery); `summaryForAgent` (adminQuery) |
| [emailSuppressions.ts](../../convex/emailSuppressions.ts) | `recordSuppression` (internalMutation) |
| [evidencePack.ts](../../convex/evidencePack.ts) | `gather` (internalQuery); `recordExport` (internalMutation); `produce` (governanceAction) |
| [fanOutAngles.ts](../../convex/fanOutAngles.ts) | `rebuildHoldAngles` (internalMutation); `rebuildPass` (internalMutation); `clearOlderAngles` (internalMutation); `purgeHoldAngles` (internalMutation) |
| [fanOutLimits.ts](../../convex/fanOutLimits.ts) | `setCompanyFanOutLimits` (superAdminMutation); `setSiteFanOutLimits` (superAdminMutation) |
| [fanOutPageJudge.ts](../../convex/fanOutPageJudge.ts) | `judgeHoldPages` (internalAction); `anglesToJudge` (internalQuery); `pagesToOffer` (internalQuery); `pageSearches` (internalQuery); `writeJudgments` (internalMutation) |
| [followChannels.ts](../../convex/followChannels.ts) | `listChannelsForAdmin` (superAdminQuery); `addChannel` (superAdminMutation); `setChannelCollect` (superAdminMutation); `removeChannel` (superAdminMutation) |
| [googleAnalyticsActionFunnels.ts](../../convex/googleAnalyticsActionFunnels.ts) | `actionsOf` (internalQuery) |
| [googleAnalyticsAgentRun.ts](../../convex/googleAnalyticsAgentRun.ts) | `runGoing` (internalQuery); `agentCollections` (internalQuery); `runGoogleAnalyticsCollectorNow` (internalAction); `startSiteRun` (internalMutation) |
| [googleAnalyticsChannelReads.ts](../../convex/googleAnalyticsChannelReads.ts) | `analyticsChannelTop` (tenantQuery); `analyticsChannelEvents` (tenantQuery); `analyticsChannelDays` (tenantQuery); `analyticsChannelsTop` (tenantQuery) |
| [googleAnalyticsChartReads.ts](../../convex/googleAnalyticsChartReads.ts) | `analyticsChart` (tenantQuery); `analyticsPeriodBeforeChart` (tenantQuery); `analyticsChannelChart` (tenantQuery); `analyticsCampaignChart` (tenantQuery) |
| [googleAnalyticsCollect.ts](../../convex/googleAnalyticsCollect.ts) | `collectTarget` (internalQuery); `writeDay` (internalMutation); `slotsOf` (internalQuery); `putPeriodParts` (internalMutation); `flipSlot` (internalMutation); `dropStaleParts` (internalMutation); `noteShop` (internalMutation); `finishCollection` (internalMutation); `dropLive` (internalMutation); `clearFigures` (internalMutation); `purgeFigures` (internalMutation) |
| [googleAnalyticsConnect.ts](../../convex/googleAnalyticsConnect.ts) | `beginGoogleAnalyticsConnect` (adminMutation); `pendingByState` (internalQuery); `recordAttempt` (internalMutation); `completeSignIn` (internalMutation); `chooseGoogleAnalyticsProperty` (adminMutation); `changeWhatCounts` (adminMutation); `countingTarget` (internalQuery); `readWhatCounts` (internalAction); `writeWhatCounts` (internalMutation); `saveWhatCounts` (adminMutation); `disconnectGoogleAnalytics` (adminMutation); `purgeHold` (internalMutation); `noteProblem` (internalMutation); `readFailed` (internalMutation); `googleConnectionOf` (internalQuery); `googleAnalyticsStatus` (tenantQuery) |
| [googleAnalyticsConversionReads.ts](../../convex/googleAnalyticsConversionReads.ts) | `analyticsVisitorMap` (tenantQuery) |
| [googleAnalyticsCountries.ts](../../convex/googleAnalyticsCountries.ts) | `dropCountriesNotKept` (internalMutation); `dropCountryRecords` (internalMutation) |
| [googleAnalyticsEventReads.ts](../../convex/googleAnalyticsEventReads.ts) | `analyticsEvents` (tenantQuery); `analyticsEvent` (tenantQuery) |
| [googleAnalyticsFillAfter.ts](../../convex/googleAnalyticsFillAfter.ts) | `startFills` (internalMutation); `noteFillReached` (internalMutation) |
| [googleAnalyticsFlowReads.ts](../../convex/googleAnalyticsFlowReads.ts) | `analyticsLandingFlow` (tenantQuery) |
| [googleAnalyticsHealth.ts](../../convex/googleAnalyticsHealth.ts) | `runHealthChecks` (internalMutation) |
| [googleAnalyticsHeroes.ts](../../convex/googleAnalyticsHeroes.ts) | `analyticsHeroPage` (tenantQuery) |
| [googleAnalyticsHistory.ts](../../convex/googleAnalyticsHistory.ts) | `rollHistory` (internalMutation); `writeHistory` (internalMutation); `oldestDayOf` (internalQuery); `noteHistoryFrom` (internalMutation) |
| [googleAnalyticsLive.ts](../../convex/googleAnalyticsLive.ts) | `liveTarget` (internalQuery); `putLive` (internalMutation); `askEventFunnel` (tenantAction) |
| [googleAnalyticsOverviewReads.ts](../../convex/googleAnalyticsOverviewReads.ts) | `analyticsOverviewPanels` (tenantQuery); `analyticsOverviewPagePanels` (tenantQuery) |
| [googleAnalyticsPageChannels.ts](../../convex/googleAnalyticsPageChannels.ts) | `analyticsPageChannelExplorer` (tenantQuery) |
| [googleAnalyticsPageConversions.ts](../../convex/googleAnalyticsPageConversions.ts) | `analyticsPageVisitsPerConversion` (tenantQuery); `analyticsPageConversionGrid` (tenantQuery) |
| [googleAnalyticsPageReads.ts](../../convex/googleAnalyticsPageReads.ts) | `analyticsLandingPage` (tenantQuery); `analyticsPage` (tenantQuery); `analyticsPagesDaily` (tenantQuery) |
| [googleAnalyticsPageSeries.ts](../../convex/googleAnalyticsPageSeries.ts) | `writePageSeries` (internalMutation); `pagesSeenOf` (internalQuery); `notePageChannelsFrom` (internalMutation); `notePagesHeld` (internalMutation); `dropOldPageSeries` (internalMutation) |
| [googleAnalyticsProductReads.ts](../../convex/googleAnalyticsProductReads.ts) | `analyticsProducts` (tenantQuery); `analyticsProductList` (tenantQuery); `analyticsProductListAll` (tenantQuery) |
| [googleAnalyticsQuota.ts](../../convex/googleAnalyticsQuota.ts) | `quotaSeenOf` (internalQuery); `noteQuota` (internalMutation) |
| [googleAnalyticsReads.ts](../../convex/googleAnalyticsReads.ts) | `analyticsListPage` (tenantQuery); `analyticsListAll` (tenantQuery); `analyticsTopList` (tenantQuery); `analyticsOverview` (tenantQuery); `analyticsConversions` (tenantQuery); `analyticsSites` (tenantQuery) |
| [googleAnalyticsRealtime.ts](../../convex/googleAnalyticsRealtime.ts) | `askGoogleAnalyticsRealtime` (tenantAction) |
| [googleAnalyticsRunEnd.ts](../../convex/googleAnalyticsRunEnd.ts) | `closeSiteRun` (internalMutation); `clearCollecting` (internalMutation) |
| [googleAnalyticsSteps.ts](../../convex/googleAnalyticsSteps.ts) | `collectSiteStep` (internalAction); `fillHistory` (internalAction); `fillPageHistory` (internalAction) |
| [googleAnalyticsTitles.ts](../../convex/googleAnalyticsTitles.ts) | `putTitles` (internalMutation); `dropOldTitles` (internalMutation) |
| [googleAnalyticsVisitorReads.ts](../../convex/googleAnalyticsVisitorReads.ts) | `analyticsVisitors` (tenantQuery) |
| [googleConnection.ts](../../convex/googleConnection.ts) | `waitingForSignIn` (internalQuery); `keepGrant` (internalMutation); `accountInUse` (internalQuery); `unusedOf` (internalQuery); `releaseUnused` (internalAction); `dropConnection` (internalMutation); `forgetHold` (internalAction); `tokenRowOf` (internalQuery); `storeRenewedToken` (internalMutation); `dropTokens` (internalMutation) |
| [googleUpdates.ts](../../convex/googleUpdates.ts) | `listGoogleUpdates` (superAdminQuery); `getGoogleUpdate` (superAdminQuery); `listGoogleUpdatesBetween` (tenantQuery); `listLatestGoogleUpdates` (tenantQuery); `createGoogleUpdate` (superAdminMutation); `updateGoogleUpdate` (superAdminMutation); `deleteGoogleUpdate` (superAdminMutation); `fileFeedUpdate` (internalMutation) |
| [googleUpdatesFeed.ts](../../convex/googleUpdatesFeed.ts) | `collectGoogleUpdates` (internalAction) |
| [governanceActivity.ts](../../convex/governanceActivity.ts) | `getGovernanceActivity` (governanceQuery) |
| [governanceDashboard.ts](../../convex/governanceDashboard.ts) | `getGovernanceDashboard` (governanceQuery) |
| [governanceRegister.ts](../../convex/governanceRegister.ts) | `getOwnerCandidates` (governanceQuery); `getAiRegister` (governanceQuery) |
| [governanceRollups.ts](../../convex/governanceRollups.ts) | `rebuildGovernanceRollups` (internalMutation) |
| [hakkenAdvice.ts](../../convex/hakkenAdvice.ts) | `noteAdvice` (tenantMutation); `latestAdviceInternal` (internalQuery) |
| [hakkenAssistant.ts](../../convex/hakkenAssistant.ts) | `ensureAssistantInternal` (internalMutation); `getAssistantInternal` (internalQuery); `answerInternal` (internalAction) |
| [hakkenCaretaker.ts](../../convex/hakkenCaretaker.ts) | `careStepInternal` (internalMutation); `ensureCaretakerInternal` (internalMutation); `isCaretakerOnInternal` (internalQuery); `careForTasks` (internalAction) |
| [hakkenResearch.ts](../../convex/hakkenResearch.ts) | `ensureResearcherInternal` (internalMutation); `isResearcherOnInternal` (internalQuery); `researchInternal` (internalAction); `tellOwnerInternal` (internalMutation) |
| [hakkenStatReporter.ts](../../convex/hakkenStatReporter.ts) | `ensureStatReporterInternal` (internalMutation); `isStatReporterOnInternal` (internalQuery); `dueReportsInternal` (internalQuery); `reportPreviewInternal` (internalQuery); `sendReportInternal` (internalMutation); `reportDue` (internalAction); `runStatReporterNow` (internalAction) |
| [hakkenTaskCredits.ts](../../convex/hakkenTaskCredits.ts) | `taskPricesInternal` (internalQuery) |
| [hakkenTaskFigures.ts](../../convex/hakkenTaskFigures.ts) | `resolveTargetInternal` (internalQuery); `websiteDaysInternal` (internalQuery); `targetDaysInternal` (internalAction) |
| [hakkenTasks.ts](../../convex/hakkenTasks.ts) | `listMine` (tenantQuery); `pauseMine` (tenantMutation); `resumeMine` (tenantMutation); `deleteMine` (tenantMutation); `listForCompany` (superAdminQuery); `pauseForCompany` (superAdminMutation); `resumeForCompany` (superAdminMutation); `deleteForCompany` (superAdminMutation); `createInternal` (internalMutation); `listForOwnerInternal` (internalQuery); `ownTaskInternal` (internalQuery); `answerProposal` (tenantMutation); `answerProposalInternal` (internalMutation) |
| [hakkenWatchFigures.ts](../../convex/hakkenWatchFigures.ts) | `trackedQuestionInternal` (internalQuery); `trackedSearchInternal` (internalQuery); `answerNowInternal` (internalQuery); `rankingNowInternal` (internalQuery) |
| [hakkenWatcher.ts](../../convex/hakkenWatcher.ts) | `ensureWatcherInternal` (internalMutation); `dueTasksInternal` (internalQuery); `taskForCheckInternal` (internalQuery); `watchForCheckInternal` (internalQuery); `recordCheckInternal` (internalMutation); `isWatcherOnInternal` (internalQuery) |
| [hakkenWatcherActions.ts](../../convex/hakkenWatcherActions.ts) | `watchDue` (internalAction); `runWatcherNow` (internalAction) |
| [holdPageRefs.ts](../../convex/holdPageRefs.ts) | `pageListPart` (internalQuery); `addPages` (internalMutation); `placePages` (internalMutation); `purgeHold` (internalMutation) |
| [holdPages.ts](../../convex/holdPages.ts) | `requestRebuild` (internalMutation); `requestWebsiteRebuilds` (internalMutation); `rebuildHead` (internalQuery); `sitemapPagesPage` (internalQuery); `crawlPagesPage` (internalQuery); `rankedPagesPage` (internalQuery); `judgedTypesPage` (internalQuery); `consolePagesPart` (internalQuery); `landingVisits` (internalQuery); `titlesPage` (internalQuery); `holdPagesPage` (internalQuery); `applyHoldPages` (internalMutation); `clearHoldPagesStep` (internalMutation); `purgeHoldPages` (internalMutation); `bingPagesPart` (internalQuery); `rebuildHoldPages` (internalAction) |
| [holdPagesSteps.ts](../../convex/holdPagesSteps.ts) | `rebuildHoldPages` (internalAction) |
| [holdProfiles.ts](../../convex/holdProfiles.ts) | `listNamedWebsitesInternal` (internalQuery); `businessOfInternal` (internalQuery); `getHoldProfile` (superAdminQuery); `setHoldBrandNames` (superAdminMutation); `setHoldBusinessProfile` (superAdminMutation); `describeHoldForJudgingInternal` (internalQuery); `describeWebsiteHoldsForJudging` (internalQuery) |
| [insightAiSearch.ts](../../convex/insightAiSearch.ts) | `insightsAiSearch` (tenantQuery) |
| [insightBoxes.ts](../../convex/insightBoxes.ts) | `boxFactsInternal` (internalQuery); `saveBoxes` (internalMutation); `insightsScreenBox` (tenantQuery) |
| [insightCompeting.ts](../../convex/insightCompeting.ts) | `groupsForRun` (internalAction); `keptForRun` (internalQuery); `saveGroups` (internalMutation); `insightsCannibalisation` (tenantQuery); `insightsCompetingGroup` (tenantQuery); `groupTarget` (internalQuery); `groupListPart` (internalQuery); `groupPageData` (internalQuery); `groupSearchData` (internalQuery) |
| [insightCompetingJudge.ts](../../convex/insightCompetingJudge.ts) | `judgeTarget` (internalQuery); `picksFor` (internalQuery); `savePicks` (internalMutation); `pickWebsite` (internalAction) |
| [insightCompetingSteps.ts](../../convex/insightCompetingSteps.ts) | `groupsForRun` (internalAction); `prepareGroups` (internalAction) |
| [insightDecisions.ts](../../convex/insightDecisions.ts) | `pagesPart` (internalQuery); `crawlPart` (internalQuery); `decisionSources` (internalQuery); `keptDecisions` (internalQuery); `decideNow` (internalAction); `saveDecisions` (internalMutation); `insightsPageDecisions` (tenantQuery) |
| [insightHistory.ts](../../convex/insightHistory.ts) | `historyTarget` (internalQuery); `historyMetadataPart` (internalQuery); `historyDataPart` (internalQuery); `saveHistory` (internalMutation); `historyOf` (internalQuery); `fetchHistory` (internalAction) |
| [insightHistorySteps.ts](../../convex/insightHistorySteps.ts) | `fetchHistory` (internalAction); `planForRun` (internalAction); `fillForRun` (internalAction) |
| [insightsAdmin.ts](../../convex/insightsAdmin.ts) | `insightWeeksList` (superAdminQuery); `insightWeekDetail` (superAdminQuery); `insightPatterns` (superAdminQuery) |
| [insightsConversion.ts](../../convex/insightsConversion.ts) | `reviewInputs` (internalQuery); `saveConversion` (internalMutation); `insightsConversion` (tenantQuery); `startExperiment` (tenantMutation) |
| [insightsCounts.ts](../../convex/insightsCounts.ts) | `refreshInsightsCountsInternal` (internalMutation) |
| [insightsDrafts.ts](../../convex/insightsDrafts.ts) | `draftInputs` (internalQuery); `saveDrafts` (internalMutation); `siteDrafts` (tenantQuery); `siteDraft` (tenantQuery); `decideDraft` (tenantMutation) |
| [insightsPanel.ts](../../convex/insightsPanel.ts) | `panelInputs` (internalQuery); `savePanel` (internalMutation); `syncPanel` (internalMutation); `sitePanel` (tenantQuery) |
| [insightsPeriod.ts](../../convex/insightsPeriod.ts) | `insightsPeriodView` (tenantQuery); `runView` (internalQuery); `rankSnapshot` (internalQuery); `insightsEnquiries` (tenantQuery); `insightsEnquirySource` (tenantQuery) |
| [insightsQuick.ts](../../convex/insightsQuick.ts) | `clicksToday` (internalQuery); `saveQuick` (internalMutation); `quickCheck` (internalAction); `insightsQuickCheck` (tenantQuery) |
| [insightsReading.ts](../../convex/insightsReading.ts) | `searchConsoleFactsInternal` (internalQuery); `analyticsFactsInternal` (internalQuery); `isShopInternal` (internalQuery); `measurementInternal` (internalQuery); `planInternal` (internalQuery); `ownSitesFactsInternal` (internalQuery); `marketFactsInternal` (internalQuery); `analyticsTargetInternal` (internalQuery); `monthlyInternal` (internalQuery); `monthFactsInternal` (internalQuery); `strategyInternal` (internalQuery); `pageChangesInternal` (internalAction); `newChangesInternal` (internalQuery) |
| [insightsReadingParts.ts](../../convex/insightsReadingParts.ts) | `pageYearPart` (internalQuery) |
| [insightsReadingSteps.ts](../../convex/insightsReadingSteps.ts) | `pageChanges` (internalAction) |
| [insightsReads.ts](../../convex/insightsReads.ts) | `sectionRefresh` (tenantQuery); `insightsHome` (tenantQuery); `insightsLeagues` (tenantQuery); `insightsThisWeek` (tenantQuery); `insightsAllFindings` (tenantQuery); `insightsFinding` (tenantQuery); `insightsReports` (tenantQuery); `insightsReport` (tenantQuery); `insightsLatestReport` (tenantQuery); `markInsightReportRead` (tenantMutation); `insightsStrategy` (tenantQuery); `insightsService` (tenantQuery); `insightsTrackRecord` (tenantQuery); `markInsightFindingActed` (tenantMutation); `insightsMeasurement` (tenantQuery); `insightsPlan` (tenantQuery); `insightsSources` (tenantQuery) |
| [insightsRun.ts](../../convex/insightsRun.ts) | `runInsightsTeamNow` (internalAction); `runWebsite` (internalAction); `decideWebsite` (internalAction) |
| [insightsRunAfter.ts](../../convex/insightsRunAfter.ts) | `afterWeek` (internalAction) |
| [insightsRunSteps.ts](../../convex/insightsRunSteps.ts) | `bookInsightsWatch` (internalMutation); `handOnInsights` (internalMutation); `cancelInsightsWatch` (internalMutation); `watchInsightsStep` (internalMutation); `modelAnswer` (internalQuery); `runEnded` (internalQuery); `recordStage` (internalMutation); `stageResults` (internalQuery); `savedWeek` (internalQuery); `lastServices` (internalQuery) |
| [insightsRunWorker.ts](../../convex/insightsRunWorker.ts) | `continueRun` (internalAction) |
| [insightsTeam.ts](../../convex/insightsTeam.ts) | `teamSetup` (internalQuery); `ensureTeamInternal` (internalMutation); `startTeamNowInternal` (internalMutation); `startWebsiteRun` (internalMutation); `saveWeek` (internalMutation); `runCost` (internalQuery); `getCompanyInsightsSchedule` (superAdminQuery); `saveCompanyInsightsSchedule` (superAdminMutation); `reportsDue` (internalQuery); `reportTargetsForRun` (internalQuery); `saveReport` (internalMutation); `openFindings` (internalQuery); `scoreFindings` (internalMutation); `saveChanges` (internalMutation); `learningsFor` (internalQuery); `insightFixedRules` (superAdminQuery) |
| [inventoryRollups.ts](../../convex/inventoryRollups.ts) | `rebuildGlobalInventoryRollup` (superAdminMutation) |
| [invites.ts](../../convex/invites.ts) | `getActiveTemplate` (softQuery); `saveTemplate` (superAdminMutation); `getPendingInvites` (adminQuery); `getInvitesByCompany` (adminQuery); `revokeInvite` (adminMutation); `createInviteRecord` (internalMutation); `dispatchInviteEmail` (adminAction) |
| [jobLedger.ts](../../convex/jobLedger.ts) | `recordJobOutcomeInternal` (internalMutation); `runJob` (internalAction); `listJobRuns` (adminQuery) |
| [keywordResearch.ts](../../convex/keywordResearch.ts) | `researchSetup` (tenantQuery); `lookUp` (tenantMutation); `lookUpAgain` (tenantMutation); `lookUpInCountry` (tenantMutation); `pastLookups` (tenantQuery); `lookupOverview` (tenantQuery); `openResults` (tenantMutation); `lookupResults` (tenantQuery); `researchLists` (tenantQuery); `researchList` (tenantQuery); `addToResearchList` (tenantMutation); `removeFromResearchList` (tenantMutation); `renameResearchList` (tenantMutation); `deleteResearchList` (tenantMutation); `trackFromResearchList` (tenantMutation) |
| [keywordResearchAnswers.ts](../../convex/keywordResearchAnswers.ts) | `openAnswers` (tenantMutation); `lookupAnswers` (tenantQuery) |
| [keywordResearchCompetitors.ts](../../convex/keywordResearchCompetitors.ts) | `competitorStarts` (tenantQuery); `competitorGap` (tenantQuery) |
| [keywordResearchIdeas.ts](../../convex/keywordResearchIdeas.ts) | `openIdeas` (tenantMutation); `lookupIdeas` (tenantQuery) |
| [keywordResearchQuestion.ts](../../convex/keywordResearchQuestion.ts) | `writeQuestion` (internalAction) |
| [keywordResearchRun.ts](../../convex/keywordResearchRun.ts) | `readWork` (internalQuery); `readTopUrls` (internalQuery); `readQuestionSetup` (internalQuery); `recordResearchCall` (internalMutation); `fileOverviews` (internalMutation); `fileSerp` (internalMutation); `fileDetails` (internalMutation); `fileIdeas` (internalMutation); `fileAnswers` (internalMutation); `settleLookups` (internalMutation); `runKeywordResearchNow` (internalAction) |
| [kiosk.ts](../../convex/kiosk.ts) | `getKioskConfig` (publicQuery); `recordKioskVoiceTurn` (publicMutation); `createKioskThread` (publicMutation); `validateKioskThreadAccess` (internalQuery); `authorizeKioskVoiceTicket` (internalMutation); `listMyReceptionScreens` (moduleQuery); `recordKioskHeartbeat` (publicMutation) |
| [kioskActions.ts](../../convex/kioskActions.ts) | `createKioskVoiceSession` (publicAction) |
| [knowledge.ts](../../convex/knowledge.ts) | `generateUploadUrl` (adminMutation); `getDocuments` (tenantQuery); `getPaginatedDocuments` (tenantQuery); `getWebsiteDocuments` (tenantQuery); `getQualitySummary` (softQuery); `inspectDocument` (tenantQuery); `getThreadDocuments` (softQuery); `saveDocument` (tenantMutation); `saveChatDocument` (tenantMutation); `deleteDocument` (tenantMutation); `retryDocumentIngestion` (tenantMutation); `repairFlaggedDocuments` (tenantMutation); `getDocInternal` (internalQuery); `markDocIngestionStartedInternal` (internalMutation); `setDocumentTitleInternal` (internalMutation); `markDocPendingInternal` (internalMutation); `getThreadDocumentsInternal` (internalQuery); `garbageCollectThreadVectors` (internalMutation); `claimNextPendingUrlInternal` (internalMutation); `reserveWebsiteMapInternal` (internalMutation); `claimNextPendingFileInternal` (internalMutation); `startKnowledgeFileQueue` (adminMutation); `saveManualText` (tenantMutation); `saveAnswerToWiki` (tenantMutation); `rereadSourceForCompany` (tenantMutation); `rereadSourceForGlobal` (tenantMutation); `queueWebsiteUrls` (tenantMutation); `deleteWebsiteBulk` (tenantMutation); `purgeDocumentChunksInternal` (internalMutation); `searchChunksByTextInternal` (internalQuery); `saveChunksInternal` (internalMutation); `markDocFailedInternal` (internalMutation); `debugCount` (internalQuery) |
| [knowledgeActions.ts](../../convex/knowledgeActions.ts) | `ingestDocument` (internalAction); `processKnowledgeFileQueue` (internalAction); `mapWebsite` (adminAction); `testRetrieval` (tenantAction); `processWebsiteQueue` (internalAction) |
| [knowledgeArticles.ts](../../convex/knowledgeArticles.ts) | `listPublishedPage` (tenantQuery); `listPublishedSince` (tenantQuery); `getPinnedForReaders` (tenantQuery); `listMoreForReaders` (tenantQuery); `getPublishedArticle` (tenantQuery); `listArticlesPage` (superAdminQuery); `getArticle` (superAdminQuery); `createArticle` (superAdminMutation); `updateArticle` (superAdminMutation); `deleteArticle` (superAdminMutation) |
| [knowledgeEvidence.ts](../../convex/knowledgeEvidence.ts) | `sweepEvidenceInternal` (internalMutation); `getChunkPriorsInternal` (internalQuery); `getDocumentEvidenceForCompany` (adminQuery) |
| [knowledgeList.ts](../../convex/knowledgeList.ts) | `listKnowledgeForAdmin` (superAdminQuery); `listKnowledgeForCsv` (superAdminQuery) |
| [knowledgeReading.ts](../../convex/knowledgeReading.ts) | `getChunkForReadingInternal` (internalQuery) |
| [knowledgeReembed.ts](../../convex/knowledgeReembed.ts) | `getStaleChunkPageInternal` (internalQuery); `getRemainingOnModelInternal` (internalQuery); `saveReembeddedChunkInternal` (internalMutation) |
| [knowledgeReembedActions.ts](../../convex/knowledgeReembedActions.ts) | `reembedStaleChunks` (internalAction) |
| [leadStory.ts](../../convex/leadStory.ts) | `pinLeadStory` (superAdminMutation); `unpinLeadStory` (superAdminMutation) |
| [learnMenu.ts](../../convex/learnMenu.ts) | `getLearnMenuCounts` (tenantQuery) |
| [libraryArticleActions.ts](../../convex/libraryArticleActions.ts) | `readPage` (superAdminAction) |
| [libraryArticleEmbeddings.ts](../../convex/libraryArticleEmbeddings.ts) | `embedSectionsInternal` (internalAction) |
| [libraryArticleWriter.ts](../../convex/libraryArticleWriter.ts) | `writeForReaders` (superAdminAction); `writeMissingInternal` (internalAction) |
| [libraryArticles.ts](../../convex/libraryArticles.ts) | `listArticlesPage` (superAdminQuery); `listArticlesForExport` (superAdminQuery); `listAdminPublications` (superAdminQuery); `getArticle` (superAdminQuery); `findByUrlInternal` (internalQuery); `createArticle` (superAdminMutation); `updateArticle` (superAdminMutation); `deleteArticle` (superAdminMutation); `listForReaders` (tenantQuery); `getReaderOverview` (tenantQuery); `listForReadersSince` (tenantQuery); `getForReader` (tenantQuery); `getPinnedForReaders` (tenantQuery); `listMoreForReaders` (tenantQuery); `writerModelInternal` (internalQuery); `missingReaderWordsInternal` (internalQuery); `saveReaderWordsInternal` (internalMutation); `searchLibraryInternal` (internalQuery); `sectionsToEmbedInternal` (internalQuery); `saveSectionEmbeddingInternal` (internalMutation) |
| [localCollectNow.ts](../../convex/localCollectNow.ts) | `queueLocalNow` (internalMutation) |
| [localDemoSeed.ts](../../convex/localDemoSeed.ts) | `seed` (publicMutation) |
| [localFiling.ts](../../convex/localFiling.ts) | `fileFound` (internalMutation); `fileMarket` (internalMutation); `fileProfile` (internalMutation); `filePosts` (internalMutation); `fileQuestions` (internalMutation); `fileMapCheck` (internalMutation) |
| [localReviews.ts](../../convex/localReviews.ts) | `fileReviews` (internalMutation) |
| [localSummaries.ts](../../convex/localSummaries.ts) | `rebuildLocalSummary` (internalMutation) |
| [localTestAuth.ts](../../convex/localTestAuth.ts) | `seedInternal` (internalMutation); `seed` (publicMutation); `cleanup` (publicMutation); `authorize` (internalQuery) |
| [maintenanceScripts.ts](../../convex/maintenanceScripts.ts) | `list` (superAdminQuery); `get` (superAdminQuery); `run` (superAdminMutation) |
| [mcpDiscovery.ts](../../convex/mcpDiscovery.ts) | `getServerForDiscovery` (internalQuery); `recordDiscovery` (internalMutation); `listDiscoveredTools` (internalQuery); `listServerTools` (adminQuery); `discoverServerTools` (adminAction) |
| [mcpServers.ts](../../convex/mcpServers.ts) | `listServers` (adminQuery); `getServer` (adminQuery); `createServer` (adminMutation); `updateServer` (adminMutation); `setServerStatus` (adminMutation); `deleteServer` (adminMutation) |
| [mcpToolCall.ts](../../convex/mcpToolCall.ts) | `getCallTarget` (internalQuery); `callServerTool` (internalAction) |
| [mcpToolPromotion.ts](../../convex/mcpToolPromotion.ts) | `importServerTools` (adminMutation) |
| [memoryMigration.ts](../../convex/memoryMigration.ts) | `getMigrationStateInternal` (internalQuery); `ensureAboutPageInternal` (internalMutation); `applyMigrationMoveInternal` (internalMutation); `stampMigrationInternal` (internalMutation) |
| [memoryMigrationActions.ts](../../convex/memoryMigrationActions.ts) | `migrateCompanyMemories` (internalAction) |
| [messageEvidence.ts](../../convex/messageEvidence.ts) | `getForMessage` (tenantQuery) |
| [messageFeedback.ts](../../convex/messageFeedback.ts) | `upsertForMessage` (tenantMutation); `getMineForThread` (tenantQuery) |
| [modelSpend.ts](../../convex/modelSpend.ts) | `recordRunCostInternal` (internalMutation); `chargeEndedRunInternal` (internalMutation); `recordModelSpendInternal` (internalMutation) |
| [moneyPageChecks.ts](../../convex/moneyPageChecks.ts) | `checkTargets` (internalQuery); `saveChecks` (internalMutation); `checkWebsite` (internalAction); `siteMoneyPages` (tenantQuery) |
| [moneyView.ts](../../convex/moneyView.ts) | `getMoneyViewForCompany` (adminQuery); `getMoneyViewForGlobal` (superAdminQuery); `setAssumptionsForCompany` (adminMutation); `setAssumptionsForGlobal` (adminMutation) |
| [news.ts](../../convex/news.ts) | `getFrontPage` (tenantQuery); `getLeadForAdmin` (superAdminQuery); `getNewsItem` (tenantQuery); `listNewsItems` (tenantQuery); `listNewsItemsForAdmin` (superAdminQuery); `countNewsInKnowledgeForAdmin` (superAdminQuery); `deleteNewsItem` (superAdminMutation) |
| [newsAgentRunActions.ts](../../convex/newsAgentRunActions.ts) | `runNewsRoleNow` (internalAction) |
| [newsCollector.ts](../../convex/newsCollector.ts) | `readCollectorAgent` (internalQuery); `listChannelsToRead` (internalQuery); `knownKeys` (internalQuery); `saveCollectedItem` (internalMutation); `markChannelRead` (internalMutation) |
| [newsFollows.ts](../../convex/newsFollows.ts) | `listFollowsByPage` (tenantQuery); `listPicks` (tenantQuery); `getFollowTotals` (tenantQuery); `listFollowsForAdmin` (superAdminQuery); `getFollow` (superAdminQuery); `createFollow` (superAdminMutation); `updateFollow` (superAdminMutation); `setFollowPick` (superAdminMutation); `listPicksForAdmin` (superAdminQuery); `deleteFollow` (superAdminMutation); `listFollowItemsForAdmin` (superAdminQuery); `listFollowNamesForAdmin` (superAdminQuery) |
| [newsKnowledge.ts](../../convex/newsKnowledge.ts) | `setNewsItemInKnowledge` (superAdminMutation); `keepTargetInternal` (internalQuery); `keepWholeInternal` (internalAction); `keepFailedInternal` (internalMutation); `saveKeptInternal` (internalMutation) |
| [notifications.ts](../../convex/notifications.ts) | `listMine` (tenantQuery); `countMineUnread` (tenantQuery); `markRead` (tenantMutation); `markAllMineRead` (tenantMutation); `notifyUserInternal` (internalMutation) |
| [oneTimeCodes.ts](../../convex/oneTimeCodes.ts) | `requestCode` (publicMutation) |
| [orchestrator.ts](../../convex/orchestrator.ts) | `routeAgentIntent` (tenantAction) |
| [outboundHttp.ts](../../convex/outboundHttp.ts) | `request` (internalAction); `fetchSitePage` (internalAction) |
| [outbox.ts](../../convex/outbox.ts) | `reclaimOutbox` (internalMutation); `claimOutboxBatch` (internalMutation); `markOutboxPosting` (internalMutation); `settleOutboxMessage` (internalMutation); `releaseOutboxClaims` (internalMutation); `countWaitingOutbox` (internalQuery); `queueWrittenEmailInternal` (internalMutation) |
| [outboxAdmin.ts](../../convex/outboxAdmin.ts) | `listOutboxForAdmin` (superAdminQuery); `getOutboxMessageForAdmin` (superAdminQuery); `getOutboxSummaryForAdmin` (superAdminQuery) |
| [outboxQueueAgent.ts](../../convex/outboxQueueAgent.ts) | `ensureOutboxAgentInternal` (internalMutation); `tellIfStuckInternal` (internalMutation); `watchOutbox` (internalAction) |
| [outboxQueueRun.ts](../../convex/outboxQueueRun.ts) | `processOutboxNow` (internalAction) |
| [outboxTemplates.ts](../../convex/outboxTemplates.ts) | `renderOutboxMessage` (internalQuery) |
| [pageClassifications.ts](../../convex/pageClassifications.ts) | `pageClassificationPages` (superAdminQuery); `pageClassificationList` (superAdminQuery); `pageClassificationDetail` (superAdminQuery); `pageClassificationPreview` (superAdminQuery); `createPageClassification` (superAdminMutation); `updatePageClassification` (superAdminMutation); `addPageClassificationLine` (superAdminMutation); `removePageClassificationLine` (superAdminMutation); `removePageClassification` (superAdminMutation); `setPageClassification` (superAdminMutation); `removeClassificationFromPage` (superAdminMutation); `suggestPageClassifications` (superAdminMutation) |
| [pageKinds.ts](../../convex/pageKinds.ts) | `pageKindChoices` (tenantQuery) |
| [pageTitles.ts](../../convex/pageTitles.ts) | `pageTitle` (tenantQuery) |
| [personalData.ts](../../convex/personalData.ts) | `findByEmail` (internalQuery); `collectPage` (internalQuery); `produceSubjectAccess` (governanceAction); `eraseFromTable` (internalMutation); `findRunningErasure` (internalQuery); `getErasureRun` (internalQuery); `createErasureRun` (internalMutation); `saveErasureProgress` (internalMutation); `failErasureRun` (internalMutation); `finalizeErasure` (internalMutation); `recordAction` (internalMutation); `continueErasure` (internalAction); `erasureStatus` (superAdminQuery); `erase` (superAdminAction); `retainedExceptions` (governanceAction) |
| [plans.ts](../../convex/plans.ts) | `getMyCompanyPlanStatus` (softQuery); `getCompanyPlanStatus` (softQuery); `getPlans` (tenantQuery); `getPaginatedPlans` (superAdminQuery); `getActivePlans` (tenantQuery); `createPlan` (superAdminMutation); `updatePlan` (superAdminMutation); `deletePlan` (superAdminMutation); `resetBillingCycle` (internalMutation); `resetCompanyBillingCycleBatch` (internalMutation); `resetUserBillingCycleBatch` (internalMutation) |
| [platformAlertRecipients.ts](../../convex/platformAlertRecipients.ts) | `getPlatformAlertFallbackRecipients` (internalQuery) |
| [platformAlerts.ts](../../convex/platformAlerts.ts) | `dispatchPlatformAlerts` (internalAction) |
| [platformLimits.ts](../../convex/platformLimits.ts) | `getPlatformLimits` (superAdminQuery); `getCompanyLimits` (superAdminQuery); `getSiteLimits` (superAdminQuery); `setPlatformLimits` (superAdminMutation); `setCompanyLimits` (superAdminMutation); `setSiteLimits` (superAdminMutation) |
| [platformOverview.ts](../../convex/platformOverview.ts) | `getPlatformOverview` (superAdminQuery) |
| [promptFanOut.ts](../../convex/promptFanOut.ts) | `getPromptFanOut` (superAdminQuery); `addPromptFanOutQuery` (superAdminMutation); `setPromptFanOutQueryTicked` (superAdminMutation); `editPromptFanOutQuery` (superAdminMutation); `removePromptFanOutQuery` (superAdminMutation); `restorePromptFanOutQuery` (superAdminMutation); `generatePromptFanOut` (superAdminMutation); `afterFanOutFiled` (internalMutation); `afterSearchRemoved` (internalMutation); `forgetQuestion` (internalMutation) |
| [purges.ts](../../convex/purges.ts) | `getPipelineConfig` (superAdminQuery); `updatePipelineConfig` (superAdminMutation); `getPurgeHistoryPaginated` (superAdminQuery); `getRunningPurges` (superAdminQuery); `getPurgePreviewCounts` (superAdminQuery); `getPurgePreviewCountsInternal` (internalQuery); `runPurgeProofInternal` (internalMutation); `runManualPurge` (superAdminMutation); `executePurgeRecursive` (internalMutation); `reapStalePurges` (internalMutation); `dispatcher` (internalMutation); `cancelPurge` (superAdminMutation) |
| [readerPreferences.ts](../../convex/readerPreferences.ts) | `isEmailOnInternal` (internalQuery); `getMyEmailPreferences` (tenantQuery); `setMyEmail` (tenantMutation); `setAllMyEmails` (tenantMutation); `recordMyLanguage` (tenantMutation); `unsubscribeWithToken` (publicMutation); `unsubscribeWithTokenInternal` (internalMutation) |
| [reading.ts](../../convex/reading.ts) | `recordReading` (tenantMutation); `recordAnswerInternal` (internalMutation) |
| [readingAnalytics.ts](../../convex/readingAnalytics.ts) | `analyticsOverview` (superAdminQuery); `analyticsArticles` (superAdminQuery); `analyticsArticle` (superAdminQuery); `analyticsPeople` (superAdminQuery); `analyticsCompanies` (superAdminQuery); `analyticsCompany` (superAdminQuery) |
| [reviewJudging.ts](../../convex/reviewJudging.ts) | `reviewsToRead` (internalQuery); `writeReviewTopics` (internalMutation); `readAgain` (internalMutation); `readNewReviews` (internalAction) |
| [reviewReplies.ts](../../convex/reviewReplies.ts) | `ensureReplierInternal` (internalMutation); `repliesToDraft` (internalQuery); `writeReplyDraft` (internalMutation) |
| [reviewReplyActions.ts](../../convex/reviewReplyActions.ts) | `draftReplies` (internalAction) |
| [roleRuns.ts](../../convex/roleRuns.ts) | `markRunStarted` (internalMutation); `readRunCost` (internalQuery); `recordObservation` (internalMutation); `logRunLine` (internalMutation); `finishRoleRun` (internalMutation); `takeRoleTurn` (internalMutation); `recordRunModelCall` (internalMutation); `recordRunServiceCall` (internalMutation); `runSpendLeft` (internalQuery) |
| [scheduler.ts](../../convex/scheduler.ts) | `getSchedules` (superAdminQuery); `createSchedule` (superAdminMutation); `getSchedule` (superAdminQuery); `updateSchedule` (superAdminMutation); `getCompanySchedule` (superAdminQuery); `saveCompanySchedule` (superAdminMutation); `toggleSchedule` (superAdminMutation); `deleteSchedule` (superAdminMutation); `manualRunSchedule` (superAdminMutation); `completeAgentExecution` (internalMutation); `completeSimulation` (internalMutation); `getWorkflowExecutions` (superAdminQuery); `getPendingWorkflowApprovalCount` (superAdminQuery); `getWorkflowExecution` (superAdminQuery) |
| [searchConsoleAgentRun.ts](../../convex/searchConsoleAgentRun.ts) | `runSearchConsoleCollectorNow` (internalAction); `startSiteRun` (internalMutation); `takeCollectorTurn` (internalMutation) |
| [searchConsoleCatchUp.ts](../../convex/searchConsoleCatchUp.ts) | `searchConsoleCatchUp` (tenantQuery); `requestSearchConsoleCatchUp` (tenantMutation) |
| [searchConsoleChanges.ts](../../convex/searchConsoleChanges.ts) | `searchConsoleNewLost` (tenantQuery); `searchConsoleUpdates` (tenantQuery); `liveUpdatesTarget` (internalQuery); `searchConsoleLiveUpdates` (tenantAction); `searchConsoleBrandWords` (tenantQuery); `searchConsoleCurve` (tenantQuery) |
| [searchConsoleConnect.ts](../../convex/searchConsoleConnect.ts) | `beginSearchConsoleConnect` (adminMutation); `pendingByState` (internalQuery); `recordAttempt` (internalMutation); `completeSignIn` (internalMutation); `chooseSearchConsoleProperty` (adminMutation); `disconnectSearchConsole` (adminMutation); `noteProblem` (internalMutation); `googleConnectionOf` (internalQuery); `searchConsoleStatus` (tenantQuery) |
| [searchConsoleCountries.ts](../../convex/searchConsoleCountries.ts) | `searchConsoleCountryChoices` (tenantQuery); `searchConsoleMarket` (superAdminQuery); `setSearchConsoleCountries` (superAdminMutation); `clearCountry` (internalMutation) |
| [searchConsoleDemand.ts](../../convex/searchConsoleDemand.ts) | `searchConsoleDemand` (tenantQuery) |
| [searchConsoleFacts.ts](../../convex/searchConsoleFacts.ts) | `factsTarget` (internalQuery); `keyFacts` (internalQuery) |
| [searchConsoleFirstCollection.ts](../../convex/searchConsoleFirstCollection.ts) | `startFirstCollection` (internalMutation) |
| [searchConsoleHistoryDays.ts](../../convex/searchConsoleHistoryDays.ts) | `historyTarget` (internalQuery); `writeHistoryDays` (internalMutation); `markDaysFrom` (internalMutation); `fetchHistoryDays` (internalAction); `historyGaps` (internalQuery); `refetchHistoryGaps` (internalAction); `fetchChartPeriods` (internalAction); `chartFillTarget` (internalQuery); `writeChartPeriod` (internalMutation) |
| [searchConsoleHistoryFill.ts](../../convex/searchConsoleHistoryFill.ts) | `fillTarget` (internalQuery); `markCountryDaysFrom` (internalMutation) |
| [searchConsoleKeep.ts](../../convex/searchConsoleKeep.ts) | `keptSearchesPart` (internalQuery); `trackedSearches` (internalQuery) |
| [searchConsoleKeywordBooks.ts](../../convex/searchConsoleKeywordBooks.ts) | `bookChunk` (internalQuery); `addToBook` (internalMutation); `dropOldBooks` (internalMutation) |
| [searchConsoleLists.ts](../../convex/searchConsoleLists.ts) | `searchConsoleListPage` (tenantQuery); `searchConsoleSplitList` (tenantQuery); `liveTarget` (internalQuery); `keptCounts` (internalQuery); `searchConsoleLiveList` (tenantAction); `searchConsoleAppearancePages` (tenantAction); `searchConsoleKeySplits` (tenantAction); `exportRows` (internalQuery); `exportSearchConsoleList` (tenantAction); `searchConsoleKeySeries` (tenantAction) |
| [searchConsoleMainCountry.ts](../../convex/searchConsoleMainCountry.ts) | `prepareMainCountry` (internalMutation); `collectSwitched` (internalMutation) |
| [searchConsolePageRefs.ts](../../convex/searchConsolePageRefs.ts) | `keptWithAddresses` (internalQuery); `setRecordRefs` (internalMutation); `encodeKeptPages` (internalAction) |
| [searchConsolePeriodBooks.ts](../../convex/searchConsolePeriodBooks.ts) | `writeBookRecords` (internalMutation); `dropUnusedBooks` (internalMutation); `bookPart` (internalQuery) |
| [searchConsolePeriods.ts](../../convex/searchConsolePeriods.ts) | `writeWeeks` (internalMutation); `searchConsoleChartFigures` (tenantQuery); `settledSlots` (internalQuery); `buildTarget` (internalQuery); `clearPeriodSlot` (internalMutation); `writePeriodPart` (internalMutation) |
| [searchConsoleReads.ts](../../convex/searchConsoleReads.ts) | `listSearchConsoleSites` (tenantQuery); `searchConsolePerformance` (tenantQuery); `searchConsoleLiveDays` (tenantAction); `connectionMainCountry` (internalQuery); `liveDaysTarget` (internalQuery) |
| [searchConsoleRollups.ts](../../convex/searchConsoleRollups.ts) | `dropOldLines` (internalMutation); `keptBetween` (internalQuery); `typesHeld` (internalQuery); `anyKept` (internalQuery) |
| [searchConsoleSeenDays.ts](../../convex/searchConsoleSeenDays.ts) | `registerDays` (internalQuery); `writeSeenDays` (internalMutation); `recountDue` (internalQuery) |
| [searchConsoleSettle.ts](../../convex/searchConsoleSettle.ts) | `settlePart` (internalAction); `catchUpSite` (internalAction); `refreshSitePeriods` (internalAction); `rebuildSitePeriods` (internalAction) |
| [searchConsoleSettling.ts](../../convex/searchConsoleSettling.ts) | `reportsBuilt` (internalQuery); `builtTimes` (internalQuery); `weeklyRebuilds` (internalAction); `afterCompanyCollection` (internalMutation); `longPeriodsDue` (internalQuery); `startSettle` (internalMutation); `startSettleParts` (internalMutation); `partDone` (internalMutation); `settleRunOf` (internalQuery); `partCounted` (internalQuery); `settleEnded` (internalMutation) |
| [searchConsoleSteps.ts](../../convex/searchConsoleSteps.ts) | `collectSiteStep` (internalAction); `fillSiteStep` (internalAction) |
| [searchConsoleSync.ts](../../convex/searchConsoleSync.ts) | `agentCollections` (internalQuery); `stepState` (internalQuery); `startRun` (internalMutation); `finishStep` (internalMutation); `writeDayTotals` (internalMutation); `writeList` (internalMutation); `heldDayTotals` (internalQuery); `connectionsWithFigures` (internalQuery); `noteSeen` (internalMutation); `clearFigures` (internalMutation); `clearCollected` (internalMutation); `purgeHold` (internalMutation) |
| [searchConsoleTidy.ts](../../convex/searchConsoleTidy.ts) | `tidyPlan` (internalMutation); `countryCopiesStep` (internalMutation); `countrySeenStep` (internalMutation); `imageSearchesStep` (internalMutation); `imageSeenStep` (internalMutation); `registerStep` (internalMutation); `pairRecordsPart` (internalQuery); `keepRecordLines` (internalMutation); `registerSearchesPart` (internalQuery); `removeRegisterRows` (internalMutation); `addressesStep` (internalQuery); `imageDaysStep` (internalQuery); `tidyKeptFigures` (internalAction); `sizeStep` (internalQuery); `hostOfConnection` (internalQuery); `keptSize` (internalAction); `packNumbersStep` (internalMutation); `linesInFullPart` (internalQuery); `setLineKeys` (internalMutation); `packKeptNumbers` (internalAction) |
| [searchConsoleTracking.ts](../../convex/searchConsoleTracking.ts) | `searchConsoleTracking` (tenantQuery); `trackSearchConsoleItem` (tenantMutation); `searchConsoleIsTracked` (tenantQuery); `searchConsoleTrackedKeys` (tenantQuery) |
| [searchConsoleVolatility.ts](../../convex/searchConsoleVolatility.ts) | `searchConsoleVolatility` (tenantQuery) |
| [searchVolumes.ts](../../convex/searchVolumes.ts) | `writeSearchVolumes` (internalMutation); `writeDifficulties` (internalMutation) |
| [seedUsers.ts](../../convex/seedUsers.ts) | `seedSuperAdmins` (internalMutation) |
| [seedWorkflows.ts](../../convex/seedWorkflows.ts) | `seedAcmeWorkflow` (internalMutation) |
| [selfImprovementConfig.ts](../../convex/selfImprovementConfig.ts) | `getConfig` (superAdminQuery); `updateConfig` (superAdminMutation) |
| [seoAgentRuns.ts](../../convex/seoAgentRuns.ts) | `runSeoRoleNow` (internalAction); `takeCollectorTurn` (internalMutation); `listCollectingCompanies` (internalQuery); `readPlannerMode` (internalQuery); `openCompanyCycle` (internalMutation); `readCyclesCounts` (internalQuery); `countWaiting` (internalQuery); `sendIfWaiting` (internalMutation); `collectNow` (superAdminMutation); `finishCollectNow` (internalAction); `sendWhenWritten` (internalAction); `startCollectorRun` (internalMutation) |
| [seoCitationReports.ts](../../convex/seoCitationReports.ts) | `listCompanyWebsiteCitations` (superAdminQuery) |
| [seoCleanOut.ts](../../convex/seoCleanOut.ts) | `competitorWebsites` (internalQuery); `cleanStep` (internalMutation); `afterCleanOut` (internalMutation); `cleanOutCompetitors` (internalAction) |
| [seoCollection.ts](../../convex/seoCollection.ts) | `expandSeoCycle` (internalMutation) |
| [seoCollectionActions.ts](../../convex/seoCollectionActions.ts) | `fetchSeoResult` (internalAction) |
| [seoCollectionClose.ts](../../convex/seoCollectionClose.ts) | `closeCollectionRun` (superAdminMutation); `continueClosingRun` (internalMutation) |
| [seoCollectionParse.ts](../../convex/seoCollectionParse.ts) | `parseSeoResult` (internalAction); `getPullForParse` (internalQuery); `writeSeoMetrics` (internalMutation); `writeFanOutQueries` (internalMutation); `writeAiCitations` (internalMutation); `writeBulkMetrics` (internalMutation); `writeDiscoveredCompetitors` (internalMutation); `findUnjudgedKeywords` (internalQuery); `writeKeywordIntents` (internalMutation); `recordParseFailure` (internalMutation) |
| [seoCollectionProgress.ts](../../convex/seoCollectionProgress.ts) | `listCollectionsNow` (superAdminQuery) |
| [seoCollectionQueue.ts](../../convex/seoCollectionQueue.ts) | `claimSeoBatch` (internalMutation); `releaseSeoBatch` (internalMutation); `markSeoPosting` (internalMutation); `failUncertainSends` (internalMutation); `settleSeoSend` (internalMutation); `settleSeoSendBatch` (internalMutation); `getPullForFetch` (internalQuery); `settleSeoResult` (internalMutation); `noteSeoFetch` (internalMutation); `markSeoPinged` (internalMutation) |
| [seoCollectionReports.ts](../../convex/seoCollectionReports.ts) | `listSeoPulls` (superAdminQuery); `readSeoQueueCounts` (superAdminQuery); `getSeoCycle` (superAdminQuery); `listSeoCycleLines` (superAdminQuery); `listCompanyCycles` (superAdminQuery); `readSeoSpend` (superAdminQuery); `listCompanyCosts` (superAdminQuery) |
| [seoCollectionSweep.ts](../../convex/seoCollectionSweep.ts) | `sweepSeoCollection` (internalAction); `sweepDuty` (internalMutation) |
| [seoCollectorRun.ts](../../convex/seoCollectorRun.ts) | `continueCollecting` (internalAction); `bookCollectorStep` (internalMutation); `watchCollector` (internalMutation); `markCollectorStep` (internalMutation); `cancelCollectorWatch` (internalMutation) |
| [seoDiscoveredCompetitors.ts](../../convex/seoDiscoveredCompetitors.ts) | `listDiscoveredCompetitors` (superAdminQuery); `acceptDiscoveredCompetitor` (superAdminMutation); `dismissDiscoveredCompetitor` (superAdminMutation) |
| [seoFiling.ts](../../convex/seoFiling.ts) | `startFiling` (internalMutation); `finishFiling` (internalMutation); `judgeKeywordsLater` (internalAction) |
| [seoKeywordChecks.ts](../../convex/seoKeywordChecks.ts) | `writeKeywordCheck` (internalMutation) |
| [seoKeywordReports.ts](../../convex/seoKeywordReports.ts) | `listWebsiteKeywords` (superAdminQuery) |
| [seoPullAnswers.ts](../../convex/seoPullAnswers.ts) | `rowAnswersPage` (internalQuery); `rowAnswer` (internalQuery); `recordMovedAnswer` (internalMutation); `moveAnswersToFiles` (internalAction) |
| [seoRunReportRebuild.ts](../../convex/seoRunReportRebuild.ts) | `rebuildRecentRunReports` (internalMutation) |
| [seoRunReports.ts](../../convex/seoRunReports.ts) | `readRunForReport` (internalQuery); `pullsForReport` (internalQuery); `keywordsOnListPages` (internalQuery); `collectorCallsForReport` (internalQuery); `collectorRunsForReport` (internalQuery); `companyJudgementsForReport` (internalQuery); `pageTypeJudgementsForReport` (internalQuery); `writeRunReport` (internalMutation); `buildRunReport` (internalAction); `listCompanyRuns` (superAdminQuery); `getCompanyRunSummary` (superAdminQuery); `readHourlyCheck` (superAdminQuery); `getRunReport` (superAdminQuery) |
| [seoStorageMeasure.ts](../../convex/seoStorageMeasure.ts) | `tablePage` (internalQuery); `lostRanksPage` (internalQuery); `measureLostRanks` (internalAction); `rawAnswerAges` (internalQuery); `hostOf` (internalQuery); `measureSeoStorage` (internalAction) |
| [seoSupplierRetry.ts](../../convex/seoSupplierRetry.ts) | `retrySupplierRefusals` (internalMutation) |
| [seoTestDataReset.ts](../../convex/seoTestDataReset.ts) | `clearCollectedSeoData` (internalAction); `countPage` (internalQuery); `deletePage` (internalMutation) |
| [seoTools.ts](../../convex/seoTools.ts) | `listSeoOperations` (internalQuery); `startSeoCollection` (internalMutation); `requestSeoPull` (internalMutation); `readSeoMetrics` (internalQuery) |
| [settings.ts](../../convex/settings.ts) | `get` (publicQuery); `getForAdmin` (superAdminQuery); `update` (superAdminMutation); `clearLogo` (superAdminMutation); `getEmailBranding` (internalQuery); `generateUploadUrl` (superAdminMutation) |
| [sharedLimits.ts](../../convex/sharedLimits.ts) | `getSharedLimits` (internalQuery) |
| [siteAi.ts](../../convex/siteAi.ts) | `listMentions` (tenantQuery); `shareOfVoice` (tenantQuery); `listCitedPages` (tenantQuery) |
| [siteAiApps.ts](../../convex/siteAiApps.ts) | `businessesRecommended` (tenantQuery); `readNotCited` (tenantQuery) |
| [siteAiDemand.ts](../../convex/siteAiDemand.ts) | `aiDemand` (tenantQuery) |
| [siteAiOverviewGaps.ts](../../convex/siteAiOverviewGaps.ts) | `overviewGaps` (tenantQuery) |
| [siteAiPageDetail.ts](../../convex/siteAiPageDetail.ts) | `aiPageDetail` (tenantQuery) |
| [siteAngles.ts](../../convex/siteAngles.ts) | `listAngles` (tenantQuery); `keywordAngle` (tenantQuery); `listTrackedFanOut` (tenantQuery) |
| [siteAnswerShown.ts](../../convex/siteAnswerShown.ts) | `answerShown` (tenantQuery) |
| [siteAnswers.ts](../../convex/siteAnswers.ts) | `answerQuestions` (tenantQuery); `listAnswers` (tenantQuery); `answerRecord` (tenantQuery) |
| [siteAssets.ts](../../convex/siteAssets.ts) | `yourAssets` (tenantQuery) |
| [siteBackfill.ts](../../convex/siteBackfill.ts) | `backfillSites` (internalAction); `watchedSites` (internalQuery); `replayRankings` (internalMutation); `recountCitations` (internalMutation) |
| [siteBackfillRaw.ts](../../convex/siteBackfillRaw.ts) | `readStoredResults` (internalAction); `storedPulls` (internalQuery); `fileStoredAnswer` (internalMutation); `fileStoredSerpPage` (internalMutation); `fileStoredCompetitorSizes` (internalMutation); `fileStoredMetrics` (internalMutation); `fileStoredRankExtras` (internalMutation) |
| [siteBands.ts](../../convex/siteBands.ts) | `bandMoves` (tenantQuery); `listBandMoves` (tenantQuery) |
| [siteBrandRadar.ts](../../convex/siteBrandRadar.ts) | `radarOverview` (tenantQuery); `radarSources` (tenantQuery) |
| [siteBusinessDetail.ts](../../convex/siteBusinessDetail.ts) | `businessDetail` (tenantQuery) |
| [siteCharts.ts](../../convex/siteCharts.ts) | `siteSeries` (tenantQuery); `siteAndRivals` (tenantQuery) |
| [siteChecks.ts](../../convex/siteChecks.ts) | `siteChecks` (tenantQuery) |
| [siteCompetitors.ts](../../convex/siteCompetitors.ts) | `listRivals` (tenantQuery); `listOrganicCompetitors` (tenantQuery); `marketMap` (tenantQuery); `listContentGap` (tenantQuery); `listSuggested` (tenantQuery) |
| [siteCrawl.ts](../../convex/siteCrawl.ts) | `writeCrawl` (internalMutation); `siteAudit` (tenantQuery) |
| [siteCrawlDetail.ts](../../convex/siteCrawlDetail.ts) | `crawlOf` (internalQuery); `fetchCrawlDetail` (internalAction); `recordDetailCut` (internalMutation); `clearCrawlDetail` (internalMutation); `writeCrawlPages` (internalMutation); `writeCrawlLinks` (internalMutation); `clearOlderCrawlDetail` (internalMutation); `crawlProblemPages` (tenantQuery) |
| [siteDayFigures.ts](../../convex/siteDayFigures.ts) | `syncSiteAiLines` (internalAction); `syncSiteDays` (internalMutation) |
| [siteDiscovery.ts](../../convex/siteDiscovery.ts) | `recordDiscoveryTotal` (internalMutation); `siteDiscoveryTotal` (tenantQuery); `sharedWithRival` (tenantQuery) |
| [siteExports.ts](../../convex/siteExports.ts) | `exportSiteTable` (tenantAction); `exportPage` (internalQuery) |
| [siteFanOutTracking.ts](../../convex/siteFanOutTracking.ts) | `trackSiteFanOutQuery` (tenantMutation) |
| [siteGoogle.ts](../../convex/siteGoogle.ts) | `listSearches` (tenantQuery); `searchPositions` (tenantQuery) |
| [siteGoogleSerp.ts](../../convex/siteGoogleSerp.ts) | `listAbove` (tenantQuery); `listFeatures` (tenantQuery); `listQuestions` (tenantQuery) |
| [siteKeywordList.ts](../../convex/siteKeywordList.ts) | `writeListPage` (internalMutation); `finishListPage` (internalMutation); `writeListPositions` (internalMutation) |
| [siteKeywords.ts](../../convex/siteKeywords.ts) | `listKeywords` (tenantQuery); `keywordsOnDay` (tenantQuery); `listMoves` (tenantQuery); `listPages` (tenantQuery); `listSections` (tenantQuery) |
| [siteLinkFiling.ts](../../convex/siteLinkFiling.ts) | `hasNewerList` (internalQuery); `recordLinkListPage` (internalMutation); `removeRowsBefore` (internalMutation); `isNewestPull` (internalQuery); `clearPullError` (internalMutation); `removePullRows` (internalMutation); `writeBacklinks` (internalMutation); `writeReferringDomains` (internalMutation); `writeAnchors` (internalMutation); `writeReferringIps` (internalMutation); `writeLinkDays` (internalMutation); `fillDaySummaries` (internalMutation) |
| [siteLinkLists.ts](../../convex/siteLinkLists.ts) | `listBacklinks` (tenantQuery); `listBrokenBacklinks` (tenantQuery); `listReferringDomains` (tenantQuery); `listAnchors` (tenantQuery); `listReferringIps` (tenantQuery); `topSubnets` (tenantQuery); `linkChanges` (tenantQuery) |
| [siteLinkRecords.ts](../../convex/siteLinkRecords.ts) | `linkingWebsiteRecord` (tenantQuery); `anchorRecord` (tenantQuery) |
| [siteLinks.ts](../../convex/siteLinks.ts) | `linkProfile` (tenantQuery); `linkListTotals` (tenantQuery) |
| [siteListAi.ts](../../convex/siteListAi.ts) | `recountQuestion` (internalMutation); `listFacts` (internalQuery); `countQuestions` (internalMutation); `sweepList` (internalMutation); `citedCount` (internalQuery); `namedOthers` (internalQuery); `hostsOf` (internalQuery); `writeSummary` (internalMutation); `summariseList` (internalAction); `recountList` (internalAction) |
| [siteListAiDays.ts](../../convex/siteListAiDays.ts) | `listsAbout` (internalQuery); `countLines` (internalQuery); `writeLines` (internalMutation); `syncWindow` (internalAction) |
| [siteListCopies.ts](../../convex/siteListCopies.ts) | `heldCopyHash` (internalQuery); `writeCopyPart` (internalMutation); `switchCopy` (internalMutation); `dropOldParts` (internalMutation); `requestCopies` (internalMutation); `refreshListCopies` (internalMutation); `copyOwnerExists` (internalQuery); `dropCopyStep` (internalMutation) |
| [siteListCopyBuilders.ts](../../convex/siteListCopyBuilders.ts) | `pageRanksPage` (internalQuery); `everyLinkPage` (internalQuery); `buildListCopy` (internalAction); `ensureSiteListCopy` (tenantMutation) |
| [siteLocalListings.ts](../../convex/siteLocalListings.ts) | `localListings` (tenantQuery); `findListing` (tenantMutation); `linkListing` (tenantMutation); `unlinkListing` (tenantMutation) |
| [siteLocalMaps.ts](../../convex/siteLocalMaps.ts) | `mapRankings` (tenantQuery); `mapSearch` (tenantQuery) |
| [siteLocalMarket.ts](../../convex/siteLocalMarket.ts) | `localMarket` (tenantQuery); `rivalActivity` (tenantQuery) |
| [siteLocalProfile.ts](../../convex/siteLocalProfile.ts) | `businessProfile` (tenantQuery); `everyOffice` (tenantQuery) |
| [siteOverview.ts](../../convex/siteOverview.ts) | `overviewExtras` (tenantQuery) |
| [sitePageTypes.ts](../../convex/sitePageTypes.ts) | `judgePageTypes` (internalAction); `pagesToJudge` (internalQuery); `writePageTypes` (internalMutation) |
| [sitePagedLists.ts](../../convex/sitePagedLists.ts) | `listPageOf` (internalQuery); `queueListPages` (internalMutation) |
| [sitePaid.ts](../../convex/sitePaid.ts) | `listPaidKeywords` (tenantQuery) |
| [siteRadarDetails.ts](../../convex/siteRadarDetails.ts) | `websiteDetail` (tenantQuery); `questionDetail` (tenantQuery) |
| [siteRankings.ts](../../convex/siteRankings.ts) | `carryKeywordIntent` (internalMutation); `recountCitedPage` (internalMutation); `releaseHeldRequest` (internalMutation); `releaseHeldRebuilds` (internalMutation) |
| [siteRecords.ts](../../convex/siteRecords.ts) | `keywordRecord` (tenantQuery); `pageRecord` (tenantQuery); `featureKeywords` (tenantQuery); `sharedSearches` (tenantQuery) |
| [siteReviews.ts](../../convex/siteReviews.ts) | `yourReviews` (tenantQuery); `reviewsAgainstRivals` (tenantQuery); `whatCustomersSay` (tenantQuery) |
| [siteRivalCited.ts](../../convex/siteRivalCited.ts) | `rivalCitedPages` (tenantQuery); `pageRivalCitedPages` (tenantQuery) |
| [siteRivalMoves.ts](../../convex/siteRivalMoves.ts) | `rivalMoves` (tenantQuery) |
| [siteSummaries.ts](../../convex/siteSummaries.ts) | `rebuildSite` (internalAction); `beginRebuild` (internalMutation); `endRebuild` (internalMutation); `releaseRequest` (internalMutation); `completeRankedDay` (internalQuery); `latestKeywordCheck` (internalQuery); `checkBefore` (internalQuery); `firstRecordedDay` (internalQuery); `keywordPage` (internalQuery); `markLost` (internalMutation); `removeLost` (internalMutation); `writePages` (internalMutation); `writeSections` (internalMutation); `removeStale` (internalMutation); `writeRankingDay` (internalMutation); `syncDays` (internalMutation) |
| [siteWebMentions.ts](../../convex/siteWebMentions.ts) | `webMentions` (tenantQuery); `mentionsAgainstRivals` (tenantQuery); `whereToGetListed` (tenantQuery) |
| [sitemapRead.ts](../../convex/sitemapRead.ts) | `readWebsiteSitemap` (internalAction) |
| [sitemaps.ts](../../convex/sitemaps.ts) | `sitemapTarget` (internalQuery); `readCycleSitemaps` (internalMutation); `heldSitemapPages` (internalQuery); `writeSitemapPages` (internalMutation); `switchSitemap` (internalMutation); `dropOldSitemapPages` (internalMutation) |
| [sites.ts](../../convex/sites.ts) | `listPickerHolds` (tenantQuery); `holdFocusInternal` (internalQuery); `listMySites` (tenantQuery); `getMySite` (tenantQuery) |
| [storageMeasure.ts](../../convex/storageMeasure.ts) | `tablePart` (internalQuery); `measureEveryTable` (internalAction) |
| [system.ts](../../convex/system.ts) | `getSystemPrompt` (superAdminQuery); `getInternalSystemPrompt` (internalQuery); `updateSystemPrompt` (superAdminMutation); `getAnalyticsId` (publicQuery); `updateAnalyticsId` (superAdminMutation); `getPiiConfig` (adminQuery); `updatePiiConfig` (superAdminMutation) |
| [systemHealth.ts](../../convex/systemHealth.ts) | `getAnalyticsDataHealth` (internalQuery); `getSystemHealth` (internalQuery); `getAnalyticsDataHealthForAdmin` (superAdminQuery); `getSystemHealthForAdmin` (adminQuery) |
| [tasks.ts](../../convex/tasks.ts) | `listTasks` (moduleQuery); `countOpenTasks` (moduleQuery); `listAssignableMembers` (moduleQuery); `createTask` (moduleMutation); `confirmPhotoAction` (publicMutation); `completeTask` (moduleMutation); `reopenTask` (moduleMutation); `cancelTask` (moduleMutation); `createTaskFromAgent` (internalMutation); `createTaskFromWorkflow` (internalMutation); `createTaskInternal` (internalMutation) |
| [telegram.ts](../../convex/telegram.ts) | `claimWebhookUpdateInternal` (internalMutation); `myTelegram` (tenantQuery); `newTelegramCode` (tenantMutation); `unlinkTelegram` (tenantMutation); `chatLinkInternal` (internalQuery); `threadLinkInternal` (internalQuery); `userLinkInternal` (internalQuery); `redeemCodeInternal` (internalMutation); `saveQuestionInternal` (internalMutation); `saveSentInternal` (internalMutation); `newestReplyInternal` (internalQuery); `messageOfThreadInternal` (internalQuery); `proposalOfInternal` (internalQuery); `botInternal` (internalQuery); `saveBotInternal` (internalMutation) |
| [telegramActions.ts](../../convex/telegramActions.ts) | `handleUpdateInternal` (internalAction); `sendToUserInternal` (internalAction); `relayInternal` (internalAction); `setUpTelegram` (internalAction) |
| [telephony.ts](../../convex/telephony.ts) | `upsertCallOnAnswer` (internalMutation); `getCompanyForCall` (internalQuery); `admitCall` (internalMutation); `findVoiceLineForNumber` (internalQuery); `appendCallTurns` (internalMutation); `markCallEnded` (internalMutation); `getCallInternal` (internalQuery); `findCallAssignee` (internalQuery); `matchCallerToCustomer` (internalMutation); `attachCallSummary` (internalMutation); `listCalls` (moduleQuery); `getCall` (moduleQuery); `listCallsForCompany` (adminQuery); `getCallForCompany` (adminQuery); `getCompanyPhoneNumber` (moduleQuery) |
| [telephonyActions.ts](../../convex/telephonyActions.ts) | `runAfterCallStep` (internalAction) |
| [topics.ts](../../convex/topics.ts) | `listTopics` (tenantQuery); `listTopicChoices` (superAdminQuery); `listTopicsForAdmin` (superAdminQuery); `getTopic` (superAdminQuery); `createTopic` (superAdminMutation); `updateTopic` (superAdminMutation); `deleteTopic` (superAdminMutation); `seedFirstTopicsInternal` (internalMutation) |
| [uploadReservations.ts](../../convex/uploadReservations.ts) | `begin` (internalMutation); `finish` (internalMutation); `authorizeWorkbook` (internalMutation); `cleanup` (internalMutation) |
| [userMemories.ts](../../convex/userMemories.ts) | `getActiveForUserInternal` (internalQuery); `markUsedInternal` (internalMutation); `countLearnedForCompanyInternal` (internalQuery); `listMine` (tenantQuery); `addMine` (tenantMutation); `deleteMine` (tenantMutation); `listUsersToSweepInternal` (internalQuery); `getSweepInputInternal` (internalQuery); `recordSweepInternal` (internalMutation) |
| [userMemorySuggestionActions.ts](../../convex/userMemorySuggestionActions.ts) | `sweepDispatcher` (internalAction); `sweepUser` (internalAction) |
| [users.ts](../../convex/users.ts) | `getMe` (publicQuery); `getUserInternal` (internalQuery); `generateUploadUrl` (tenantMutation); `getPaginatedUsers` (tenantQuery); `getAllUsers` (tenantQuery); `getUsersByCompany` (tenantQuery); `getSuperAdmins` (superAdminQuery); `getUserById` (tenantQuery); `addUser` (tenantMutation); `updateUser` (tenantMutation); `purgeUserEntitiesInternal` (internalMutation); `deleteUser` (tenantMutation); `updateMyProfile` (tenantMutation); `getLogins` (tenantQuery); `getUserLogins` (tenantQuery); `getMyLoginsCount` (softQuery); `recordLogin` (softMutation); `recordLogout` (softMutation); `impersonateCompany` (superAdminMutation); `getUnassignedSuperAdmins` (superAdminQuery); `assignSuperAdminToCompany` (superAdminMutation); `detachSuperAdminFromCompany` (superAdminMutation); `recomputeLoginCounts` (internalMutation); `listDirectoryUsers` (superAdminQuery); `purgeOrphanedAuthIdentities` (internalMutation); `getAccountablePeople` (adminQuery) |
| [voicePreview.ts](../../convex/voicePreview.ts) | `mintVoicePreviewTicket` (tenantAction) |
| [voiceRelay.ts](../../convex/voiceRelay.ts) | `redeemVoiceTicketInternal` (internalMutation); `controlKioskVoiceTurn` (internalMutation); `admitKnowledgeLookup` (internalMutation) |
| [voiceSettings.ts](../../convex/voiceSettings.ts) | `getSpokenVoice` (tenantQuery); `setSpokenVoice` (adminMutation); `getSpokenVoiceForCompany` (internalQuery) |
| [webMentions.ts](../../convex/webMentions.ts) | `heldMentionUrls` (internalQuery); `writeMentions` (internalMutation); `writeLinkGap` (internalMutation) |
| [webScrapeActions.ts](../../convex/webScrapeActions.ts) | `scrapeUrl` (internalAction) |
| [webhookDeliveries.ts](../../convex/webhookDeliveries.ts) | `getInternal` (internalQuery); `recordQueuedInternal` (internalMutation); `queueDispatchInternal` (internalMutation); `recordAttemptInternal` (internalMutation) |
| [webhookDeliveryActions.ts](../../convex/webhookDeliveryActions.ts) | `dispatchInternal` (internalAction) |
| [webhooks.ts](../../convex/webhooks.ts) | `updateRunStatus` (internalMutation); `getRunByRunIdInternal` (internalQuery); `recordRunStart` (internalMutation); `completeApifyRun` (internalMutation) |
| [websiteAttachments.ts](../../convex/websiteAttachments.ts) | `addTrackedCompetitor` (superAdminMutation); `addTrackedWebsite` (superAdminMutation); `setTrackedPairing` (superAdminMutation); `listCompanyOwnedWebsites` (superAdminQuery) |
| [websiteCanonical.ts](../../convex/websiteCanonical.ts) | `listWebsiteQuestions` (superAdminQuery); `addWebsiteQuestion` (superAdminMutation); `setWebsiteQuestionActive` (superAdminMutation); `editWebsiteQuestion` (superAdminMutation); `removeWebsiteQuestion` (superAdminMutation); `listWebsiteKeywords` (superAdminQuery); `addWebsiteKeyword` (superAdminMutation); `setWebsiteKeywordActive` (superAdminMutation); `removeWebsiteKeyword` (superAdminMutation); `listEngines` (superAdminQuery) |
| [websiteClientView.ts](../../convex/websiteClientView.ts) | `getSiteHeader` (superAdminQuery); `getSitePortfolio` (superAdminQuery); `listTrackedSearches` (superAdminQuery); `listTrackedCompetitors` (superAdminQuery) |
| [websiteIcons.ts](../../convex/websiteIcons.ts) | `iconTarget` (internalQuery); `fetchWebsiteIcon` (internalAction); `fileWebsiteIcon` (internalMutation) |
| [websiteMoves.ts](../../convex/websiteMoves.ts) | `deriveCycleMoves` (internalMutation); `deriveSiteMoves` (internalMutation); `listSiteMoves` (superAdminQuery); `actOnMove` (superAdminMutation) |
| [websitePurge.ts](../../convex/websitePurge.ts) | `purgeWebsiteHoldingsInternal` (internalMutation); `purgeWebsiteCollectedDataInternal` (internalMutation); `purgeWebsiteListsInternal` (internalMutation); `purgeQuestionAnswersInternal` (internalMutation); `purgeSearchResultsInternal` (internalMutation); `purgeHoldListsInternal` (internalMutation); `purgeCompanyWebsitesInternal` (internalMutation) |
| [websiteSources.ts](../../convex/websiteSources.ts) | `getWebsiteSources` (superAdminQuery); `setSourceOn` (superAdminMutation); `setRankingsOn` (superAdminMutation) |
| [websites.ts](../../convex/websites.ts) | `previewWebsiteHost` (superAdminQuery); `getCompanyWebsites` (superAdminQuery); `listCompanyWebsiteRows` (superAdminQuery); `listWebsiteChoices` (superAdminQuery); `getCompanyWebsiteById` (superAdminQuery); `getPaginatedWebsites` (superAdminQuery); `getWebsiteById` (superAdminQuery); `addCompanyWebsite` (superAdminMutation); `setCompanyWebsiteSchedule` (superAdminMutation); `removeCompanyWebsite` (superAdminMutation); `createWebsite` (superAdminMutation); `deleteWebsite` (superAdminMutation); `setCompanyWebsiteLocation` (superAdminMutation); `resolveWebsiteIdsByHostInternal` (internalQuery) |
| [weeklyDigest.ts](../../convex/weeklyDigest.ts) | `readDigestSetup` (internalQuery); `liveIssueFor` (internalQuery); `readDigestMaterial` (internalQuery); `saveIssue` (internalMutation); `queueDigestPage` (internalMutation) |
| [widgets.ts](../../convex/widgets.ts) | `getWidgetsByCompany` (adminQuery); `getPrimaryWidgetByCompany` (adminQuery); `getGlobalWidgets` (superAdminQuery); `getPrimaryGlobalWidget` (superAdminQuery); `getWidgetById` (publicQuery); `saveWidget` (adminMutation); `deleteWidget` (adminMutation); `generateWidgetUploadUrl` (publicMutation); `finalizeWidgetUpload` (publicMutation); `createWidgetThread` (publicMutation) |
| [wikiActions.ts](../../convex/wikiActions.ts) | `selectWikiContextForQuery` (internalAction); `rewriteCustomerPageAfterEvent` (internalAction) |
| [wikiAsk.ts](../../convex/wikiAsk.ts) | `createAskThreadInternal` (internalMutation); `askBrainForCompany` (adminAction); `askBrainForGlobal` (adminAction) |
| [wikiContradictionActions.ts](../../convex/wikiContradictionActions.ts) | `contradictionSweep` (internalAction); `findContradictionsForCompany` (internalAction) |
| [wikiDiary.ts](../../convex/wikiDiary.ts) | `listDiaryForCompany` (adminQuery); `listDiaryForGlobal` (adminQuery) |
| [wikiDistill.ts](../../convex/wikiDistill.ts) | `claimDocumentForDistillInternal` (internalMutation); `releaseDistillClaimInternal` (internalMutation); `listCompaniesWithUndistilledInternal` (internalQuery); `hasGlobalUndistilledInternal` (internalQuery); `claimNextDistillBatchInternal` (internalMutation); `getRefreshableDocumentInternal` (internalQuery); `getDistilledDocumentsInternal` (internalQuery); `recordDistillProgressInternal` (internalMutation); `getDistillProgress` (moduleQuery); `getDistillProgressForGlobal` (adminQuery); `getDistillProgressForCompany` (adminQuery) |
| [wikiDistillActions.ts](../../convex/wikiDistillActions.ts) | `backfillSourceNotes` (internalAction); `refreshSourceNote` (internalAction); `distilNewDocument` (internalAction); `distilSweep` (internalAction); `distilCompanyBatch` (internalAction) |
| [wikiExam.ts](../../convex/wikiExam.ts) | `recordExamRunInternal` (internalMutation); `seedWikiExamCasesInternal` (internalMutation) |
| [wikiExamActions.ts](../../convex/wikiExamActions.ts) | `runWikiExam` (internalAction) |
| [wikiExamGrowth.ts](../../convex/wikiExamGrowth.ts) | `listGrowthCandidatesInternal` (internalQuery); `proposeExamCaseInternal` (internalMutation); `listProposedCasesForCompany` (adminQuery); `decideProposedCaseForCompany` (adminMutation) |
| [wikiExamGrowthActions.ts](../../convex/wikiExamGrowthActions.ts) | `growExamForCompany` (internalAction); `examGrowthSweep` (internalAction) |
| [wikiFeedback.ts](../../convex/wikiFeedback.ts) | `recordAnswerOutcomeInternal` (internalMutation); `recordJudgedGapInternal` (internalMutation); `listUnansweredForCompany` (adminQuery); `listAllUnanswered` (superAdminQuery); `listUnansweredForGlobal` (adminQuery); `dismissUnansweredForGlobal` (adminMutation); `dismissUnansweredForCompany` (adminMutation) |
| [wikiFeedbackActions.ts](../../convex/wikiFeedbackActions.ts) | `judgeUnansweredQuestion` (internalAction) |
| [wikiFilingActions.ts](../../convex/wikiFilingActions.ts) | `considerAnswer` (internalAction) |
| [wikiFreshness.ts](../../convex/wikiFreshness.ts) | `getFreshnessCandidatesInternal` (internalQuery); `getSourceTextsForPageInternal` (internalQuery); `getStaleGoalsInternal` (internalQuery); `markVerifiedInternal` (internalMutation) |
| [wikiFreshnessActions.ts](../../convex/wikiFreshnessActions.ts) | `freshnessSweep` (internalAction); `checkCompanyFreshness` (internalAction) |
| [wikiPages.ts](../../convex/wikiPages.ts) | `getCustomerPageInternal` (internalQuery); `getPageOfKindInternal` (internalQuery); `linkSourceNoteToTaughtPagesInternal` (internalMutation); `addLinksInternal` (internalMutation); `findTopicPagesForQueryInternal` (internalQuery); `getWikiAnswerContextInternal` (internalQuery); `getWikiIndexInternal` (internalQuery); `upsertSourceNoteInternal` (internalMutation); `getPagesByKeysInternal` (internalQuery); `hasGlobalWikiPagesInternal` (internalQuery); `applyRewriteInternal` (internalMutation); `listSparselyLinkedTopicsInternal` (internalQuery); `listOrphanSourceNotesInternal` (internalQuery); `refreshHubPagesInternal` (internalMutation); `listCompanyPages` (moduleQuery); `getPageDetail` (moduleQuery); `searchPagesForCompany` (adminQuery); `searchPagesForGlobal` (adminQuery); `getExportForCompany` (adminQuery); `getExportForGlobal` (adminQuery); `listPagesForGlobal` (adminQuery); `getPageDetailForGlobal` (adminQuery); `listPagesForMapForCompany` (adminQuery); `listPagesForMapForGlobal` (adminQuery); `listPagesForCompany` (adminQuery); `getPageDetailForCompany` (adminQuery); `deletePageForCompany` (adminMutation); `deletePageForGlobal` (adminMutation); `clearWikiForCompany` (adminMutation); `editPageContent` (adminMutation); `pinCorrection` (adminMutation); `unpinCorrection` (adminMutation); `editPageContentForCompany` (adminMutation); `pinCorrectionForCompany` (adminMutation); `editPageContentForGlobal` (adminMutation); `pinCorrectionForGlobal` (adminMutation); `unpinCorrectionForGlobal` (adminMutation); `unpinCorrectionForCompany` (adminMutation); `createGoalPageForCompany` (adminMutation); `createGoalPageForGlobal` (adminMutation); `getGoalPagesInternal` (internalQuery); `getRenderedPageForPhoneNumber` (internalQuery); `getRenderedPageForWidgetThread` (internalQuery); `getRenderedCustomerPageInternal` (internalQuery); `matchEmailSenderToCustomer` (internalQuery); `backfillSearchTextInternal` (internalMutation) |
| [wikiQuestions.ts](../../convex/wikiQuestions.ts) | `raiseQuestionInternal` (internalMutation); `autoResolveStaleQuestionsInternal` (internalMutation); `listOpenQuestions` (moduleQuery); `listOpenQuestionsForCompany` (adminQuery); `listOpenQuestionsForGlobal` (adminQuery); `dismissOpenQuestionForGlobal` (adminMutation); `dismissOpenQuestion` (adminMutation); `dismissOpenQuestionForCompany` (adminMutation); `getContradictionClusterInternal` (internalQuery) |
| [wikiReport.ts](../../convex/wikiReport.ts) | `buildWeeklyReportInternal` (internalQuery); `getWeeklyReportForCompany` (adminQuery); `getWeeklyReportForGlobal` (adminQuery); `notifyCompanyAdminsInternal` (internalMutation); `notifySuperAdminsInternal` (internalMutation); `sendWeeklyReports` (internalAction) |
| [wikiReviewActions.ts](../../convex/wikiReviewActions.ts) | `prepareReview` (internalAction) |
| [wikiReviews.ts](../../convex/wikiReviews.ts) | `getReviewableDocumentInternal` (internalQuery); `clearReviewFlagInternal` (internalMutation); `fileReviewInternal` (internalMutation); `listPendingReviews` (moduleQuery); `listPendingReviewsForCompany` (adminQuery); `listPendingReviewsForGlobal` (adminQuery); `decideReviewForGlobal` (adminMutation); `decideReview` (adminMutation); `decideReviewForCompany` (adminMutation) |
| [wikiRewriteEval.ts](../../convex/wikiRewriteEval.ts) | `runFixtures` (internalAction) |
| [wikiStaff.ts](../../convex/wikiStaff.ts) | `ensureWikiStaffAgentsInternal` (internalMutation); `finishStaffRunInternal` (internalMutation); `isStaffActiveInternal` (internalQuery); `recordStaffModelCallInternal` (internalMutation); `recordStaffRunInternal` (internalMutation) |
| [wikiStaffRunActions.ts](../../convex/wikiStaffRunActions.ts) | `runStaffNow` (internalAction) |
| [wikiTending.ts](../../convex/wikiTending.ts) | `listCompaniesWithPagesInternal` (internalQuery); `getTendingCandidatesInternal` (internalQuery); `repairLinksInternal` (internalMutation); `markTendedInternal` (internalMutation) |
| [wikiTendingActions.ts](../../convex/wikiTendingActions.ts) | `tendDispatcher` (internalAction); `linkDispatcher` (internalAction); `crossLinkSweep` (internalAction); `tendCompany` (internalAction) |
| [workflowEngine.ts](../../convex/workflowEngine.ts) | `initExecution` (internalMutation); `finalizeNodeStep` (internalMutation); `resumeNodeStep` (internalMutation); `rejectNodeApproval` (internalMutation); `expireStaleWorkflowApprovals` (internalMutation); `failNodeStep` (internalMutation); `linkAgentRunToStep` (internalMutation); `executeDatabaseOperation` (internalMutation); `scheduleDispatcher` (internalMutation) |
| [workflowExecutions.ts](../../convex/workflowExecutions.ts) | `createExecution` (internalMutation); `updateExecutionStatus` (internalMutation); `upsertStep` (internalMutation); `getSteps` (internalQuery); `getExecution` (internalQuery); `claimNextPendingStep` (internalMutation); `requeueStepForRetry` (internalMutation) |
| [workflowNodeConfig.ts](../../convex/workflowNodeConfig.ts) | `generateNodeConfig` (adminAction) |
| [workflowRuntime.ts](../../convex/workflowRuntime.ts) | `startWorkflow` (internalAction); `executeNode` (internalAction); `resumeApprovalStep` (superAdminAction) |
| [workflows.ts](../../convex/workflows.ts) | `list` (superAdminQuery); `getPaginatedWorkflows` (superAdminQuery); `get` (superAdminQuery); `internalGet` (internalQuery); `createWorkflow` (superAdminMutation); `updateWorkflow` (superAdminMutation); `deleteWorkflow` (superAdminMutation); `triggerManualRun` (superAdminMutation); `createPublicWorkflowRunInternal` (internalMutation); `runManualSync` (superAdminAction); `reserveWebhookTrigger` (internalMutation); `getWebhookSecret` (superAdminQuery) |
| [xConnect.ts](../../convex/xConnect.ts) | `beginXConnect` (superAdminMutation); `pendingByState` (internalQuery); `keepVerifier` (internalMutation); `endSignIn` (internalMutation); `completeXConnect` (internalMutation); `getXForAdmin` (superAdminQuery); `disconnectX` (superAdminMutation); `connectionForRun` (internalQuery); `keepRenewedAccess` (internalMutation); `markBookmarksRead` (internalMutation); `keepXAccountPlace` (internalMutation) |
| [xRead.ts](../../convex/xRead.ts) | `revokeXGrant` (internalAction) |
| [yourPages.ts](../../convex/yourPages.ts) | `listYourPages` (tenantQuery); `ensureYourPages` (tenantMutation) |

## Table Declarations

The schema composes `schema.ts` with imported table groups, including website measurements, reading/content, Insights, credits, tasks, local data, AI visibility, radar and mentions. Table names below are statically recognized `name: defineTable(...)` declarations in non-test top-level Convex modules. A table can be retained for compatibility after its original screen is gone. Absence from a route list is not deletion authorization.

| Table | Declaration source |
| --- | --- |
| `agentEvalFixtures` | [schema.ts](../../convex/schema.ts) |
| `agentEvalSuitePresets` | [schema.ts](../../convex/schema.ts) |
| `agentImprovementSuggestions` | [schema.ts](../../convex/schema.ts) |
| `agentLogs` | [schema.ts](../../convex/schema.ts) |
| `agentMemories` | [schema.ts](../../convex/schema.ts) |
| `agentMemoryCandidates` | [schema.ts](../../convex/schema.ts) |
| `agentMemoryUsage` | [schema.ts](../../convex/schema.ts) |
| `agentRunApprovals` | [schema.ts](../../convex/schema.ts) |
| `agentRunCheckpoints` | [schema.ts](../../convex/schema.ts) |
| `agentRunFeedback` | [schema.ts](../../convex/schema.ts) |
| `agentRunReflections` | [schema.ts](../../convex/schema.ts) |
| `agentRunSteps` | [schema.ts](../../convex/schema.ts) |
| `agentRuns` | [schema.ts](../../convex/schema.ts) |
| `agentSkillBindings` | [schema.ts](../../convex/schema.ts) |
| `agentSkillRollups` | [schema.ts](../../convex/schema.ts) |
| `agentSkillVersions` | [schema.ts](../../convex/schema.ts) |
| `agentSkills` | [schema.ts](../../convex/schema.ts) |
| `agentToolCalls` | [schema.ts](../../convex/schema.ts) |
| `agentToolIdempotency` | [schema.ts](../../convex/schema.ts) |
| `agentTools` | [schema.ts](../../convex/schema.ts) |
| `agentTransactions` | [schema.ts](../../convex/schema.ts) |
| `agentVersions` | [schema.ts](../../convex/schema.ts) |
| `agents` | [schema.ts](../../convex/schema.ts) |
| `aiActionRequests` | [schema.ts](../../convex/schema.ts) |
| `aiAnswerExtras` | [aiAppSchema.ts](../../convex/aiAppSchema.ts) |
| `aiAnswerIndex` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `aiAnswerTexts` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `aiAnswers` | [schema.ts](../../convex/schema.ts) |
| `aiCitations` | [schema.ts](../../convex/schema.ts) |
| `aiModelDefaults` | [schema.ts](../../convex/schema.ts) |
| `aiModelRollups` | [schema.ts](../../convex/schema.ts) |
| `aiModels` | [schema.ts](../../convex/schema.ts) |
| `aiOverviewFanOuts` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `aiProviders` | [schema.ts](../../convex/schema.ts) |
| `aiRules` | [schema.ts](../../convex/schema.ts) |
| `aiSearchVolumes` | [aiAppSchema.ts](../../convex/aiAppSchema.ts) |
| `aiTools` | [schema.ts](../../convex/schema.ts) |
| `analyticsDailySnapshots` | [schema.ts](../../convex/schema.ts) |
| `apiKeys` | [schema.ts](../../convex/schema.ts) |
| `apifyRuns` | [schema.ts](../../convex/schema.ts) |
| `arcadeRuns` | [schema.ts](../../convex/schema.ts) |
| `arcadeScores` | [schema.ts](../../convex/schema.ts) |
| `assetSummaries` | [radarSchema.ts](../../convex/radarSchema.ts) |
| `auditLogs` | [schema.ts](../../convex/schema.ts) |
| `authEvents` | [schema.ts](../../convex/schema.ts) |
| `autoClassifyRuns` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `autoSetupRuns` | [autoSetupSchema.ts](../../convex/autoSetupSchema.ts) |
| `billingAccounts` | [billingSchema.ts](../../convex/billingSchema.ts) |
| `billingCheckouts` | [billingSchema.ts](../../convex/billingSchema.ts) |
| `billingHealth` | [billingSchema.ts](../../convex/billingSchema.ts) |
| `billingSettings` | [billingSchema.ts](../../convex/billingSchema.ts) |
| `bingConnections` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingDays` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingKeywordBooks` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingLive` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingPageChecks` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingPeriods` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingTokens` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `bingWeeks` | [bingWebmasterSchema.ts](../../convex/bingWebmasterSchema.ts) |
| `brandRadarMonths` | [radarSchema.ts](../../convex/radarSchema.ts) |
| `brandRadarQuestionParts` | [radarSchema.ts](../../convex/radarSchema.ts) |
| `chatGptRadarMonths` | [radarSchema.ts](../../convex/radarSchema.ts) |
| `clarityConnections` | [claritySchema.ts](../../convex/claritySchema.ts) |
| `clarityFigures` | [claritySchema.ts](../../convex/claritySchema.ts) |
| `clarityRecordings` | [claritySchema.ts](../../convex/claritySchema.ts) |
| `classificationTypes` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `collectionParts` | [localSchema.ts](../../convex/localSchema.ts) |
| `collectionSteps` | [collectionStepsSchema.ts](../../convex/collectionStepsSchema.ts) |
| `companies` | [schema.ts](../../convex/schema.ts) |
| `companyAiDriftEvents` | [schema.ts](../../convex/schema.ts) |
| `companyDataLimits` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `companyEvalCases` | [schema.ts](../../convex/schema.ts) |
| `companyEvalRuns` | [schema.ts](../../convex/schema.ts) |
| `companyMemories` | [schema.ts](../../convex/schema.ts) |
| `companyMemoryCandidates` | [schema.ts](../../convex/schema.ts) |
| `companyMemorySweeps` | [schema.ts](../../convex/schema.ts) |
| `companyMemoryUsage` | [schema.ts](../../convex/schema.ts) |
| `companySkillBindings` | [schema.ts](../../convex/schema.ts) |
| `companySkills` | [schema.ts](../../convex/schema.ts) |
| `companyWebsites` | [schema.ts](../../convex/schema.ts) |
| `connectorOAuthTokens` | [schema.ts](../../convex/schema.ts) |
| `contentTranslations` | [contentTranslationSchema.ts](../../convex/contentTranslationSchema.ts) |
| `creditAccounts` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditBatches` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditCharges` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditDayTotals` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditMonthRollups` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditPlatformMonths` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditPrices` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `creditSettings` | [creditSchema.ts](../../convex/creditSchema.ts) |
| `dataMigrations` | [schema.ts](../../convex/schema.ts) |
| `decisionRuns` | [schema.ts](../../convex/schema.ts) |
| `decisionSettings` | [schema.ts](../../convex/schema.ts) |
| `discoveredCompetitors` | [schema.ts](../../convex/schema.ts) |
| `emailSuppressions` | [outboxSchema.ts](../../convex/outboxSchema.ts) |
| `emailTemplates` | [schema.ts](../../convex/schema.ts) |
| `fanOutAngleLists` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutAngles` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutFirstChecks` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutLimits` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutPageJudgments` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutQueryChoices` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `fanOutQuestionSettings` | [fanOutSchema.ts](../../convex/fanOutSchema.ts) |
| `followChannels` | [newsSchema.ts](../../convex/newsSchema.ts) |
| `googleAnalyticsConnections` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsDays` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsHistory` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsLive` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsPageSeries` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsPeriodSlots` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsPeriods` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleAnalyticsTitles` | [googleAnalyticsSchema.ts](../../convex/googleAnalyticsSchema.ts) |
| `googleConnections` | [googleSchema.ts](../../convex/googleSchema.ts) |
| `googleTokens` | [googleSchema.ts](../../convex/googleSchema.ts) |
| `googleUpdates` | [newsSchema.ts](../../convex/newsSchema.ts) |
| `governanceDayRollups` | [schema.ts](../../convex/schema.ts) |
| `governanceEstateRollups` | [schema.ts](../../convex/schema.ts) |
| `hakkenAdvice` | [adviceSchema.ts](../../convex/adviceSchema.ts) |
| `hakkenTaskChecks` | [hakkenTaskSchema.ts](../../convex/hakkenTaskSchema.ts) |
| `hakkenTasks` | [hakkenTaskSchema.ts](../../convex/hakkenTaskSchema.ts) |
| `holdListings` | [localSchema.ts](../../convex/localSchema.ts) |
| `holdPageAddresses` | [googleSchema.ts](../../convex/googleSchema.ts) |
| `holdPages` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `holdProfiles` | [holdProfileSchema.ts](../../convex/holdProfileSchema.ts) |
| `insightChanges` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightCompetingGroups` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightConversions` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightDrafts` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightExperiments` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightFindings` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightHistory` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightLearnings` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightMeasurements` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightPageDecisions` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightPlans` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightQuestionPanels` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightQuickChecks` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightReports` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightScreenBoxes` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightSearchPicks` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightTally` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightWeeks` | [insightsSchema.ts](../../convex/insightsSchema.ts) |
| `insightsCounts` | [insightsCountsSchema.ts](../../convex/insightsCountsSchema.ts) |
| `inventoryRollups` | [schema.ts](../../convex/schema.ts) |
| `invitations` | [schema.ts](../../convex/schema.ts) |
| `jobRuns` | [schema.ts](../../convex/schema.ts) |
| `keywordLookups` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `keywordPositionMonths` | [positionHistorySchema.ts](../../convex/positionHistorySchema.ts) |
| `knowledgeArticles` | [knowledgeArticlesSchema.ts](../../convex/knowledgeArticlesSchema.ts) |
| `knowledgeChunkStats` | [schema.ts](../../convex/schema.ts) |
| `knowledgeChunks` | [schema.ts](../../convex/schema.ts) |
| `knowledgeDocuments` | [schema.ts](../../convex/schema.ts) |
| `knowledgeImportQuotas` | [schema.ts](../../convex/schema.ts) |
| `knowledgeList` | [knowledgeListSchema.ts](../../convex/knowledgeListSchema.ts) |
| `libraryArticleSections` | [libraryArticlesSchema.ts](../../convex/libraryArticlesSchema.ts) |
| `libraryArticleTexts` | [libraryArticlesSchema.ts](../../convex/libraryArticlesSchema.ts) |
| `libraryArticles` | [libraryArticlesSchema.ts](../../convex/libraryArticlesSchema.ts) |
| `linkGapPairs` | [mentionSchema.ts](../../convex/mentionSchema.ts) |
| `listingActivityParts` | [localSchema.ts](../../convex/localSchema.ts) |
| `listingFinds` | [localSchema.ts](../../convex/localSchema.ts) |
| `listingReviewParts` | [localSchema.ts](../../convex/localSchema.ts) |
| `listingWeeks` | [localSchema.ts](../../convex/localSchema.ts) |
| `listings` | [localSchema.ts](../../convex/localSchema.ts) |
| `localMarketParts` | [localSchema.ts](../../convex/localSchema.ts) |
| `localSummaries` | [localSchema.ts](../../convex/localSchema.ts) |
| `logins` | [schema.ts](../../convex/schema.ts) |
| `maintenanceScriptRuns` | [schema.ts](../../convex/schema.ts) |
| `mapChecks` | [localSchema.ts](../../convex/localSchema.ts) |
| `mapPositionWeeks` | [localSchema.ts](../../convex/localSchema.ts) |
| `mcpServerTools` | [schema.ts](../../convex/schema.ts) |
| `mcpServers` | [schema.ts](../../convex/schema.ts) |
| `messageFeedback` | [schema.ts](../../convex/schema.ts) |
| `messages` | [schema.ts](../../convex/schema.ts) |
| `mockStorageMetadata` | [schema.ts](../../convex/schema.ts) |
| `moneyPageChecks` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `newsFollows` | [newsSchema.ts](../../convex/newsSchema.ts) |
| `newsItems` | [newsSchema.ts](../../convex/newsSchema.ts) |
| `newsTakenDown` | [newsSchema.ts](../../convex/newsSchema.ts) |
| `notifications` | [schema.ts](../../convex/schema.ts) |
| `outboxMessages` | [outboxSchema.ts](../../convex/outboxSchema.ts) |
| `pageClassificationAuto` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `pageClassificationLines` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `pageClassificationPicks` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `pageClassifications` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `personalDataErasureRuns` | [schema.ts](../../convex/schema.ts) |
| `phoneCalls` | [schema.ts](../../convex/schema.ts) |
| `plans` | [schema.ts](../../convex/schema.ts) |
| `platformLimits` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `promptFanOutDays` | [schema.ts](../../convex/schema.ts) |
| `promptFanOutQueries` | [schema.ts](../../convex/schema.ts) |
| `publicApiRequests` | [schema.ts](../../convex/schema.ts) |
| `purgeHistory` | [schema.ts](../../convex/schema.ts) |
| `readerPreferences` | [outboxSchema.ts](../../convex/outboxSchema.ts) |
| `readingActive` | [readingSchema.ts](../../convex/readingSchema.ts) |
| `readingEvents` | [readingSchema.ts](../../convex/readingSchema.ts) |
| `readingTotals` | [readingSchema.ts](../../convex/readingSchema.ts) |
| `researchAnswers` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchIdeas` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchJobs` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchKeywords` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchListKeywords` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchLists` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `researchSerps` | [keywordResearchSchema.ts](../../convex/keywordResearchSchema.ts) |
| `reviewReplyDrafts` | [localSchema.ts](../../convex/localSchema.ts) |
| `schedules` | [schema.ts](../../convex/schema.ts) |
| `searchConsoleConnections` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleDays` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleKeywordBooks` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleLists` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsolePeriodBooks` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsolePeriodUses` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsolePeriods` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleRuns` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleSeen` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleSeenDays` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleTracked` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchConsoleWeeks` | [searchConsoleSchema.ts](../../convex/searchConsoleSchema.ts) |
| `searchDifficulties` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `searchVolumes` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `seoCollectionCycles` | [schema.ts](../../convex/schema.ts) |
| `seoCycleLines` | [schema.ts](../../convex/schema.ts) |
| `seoCycleSpend` | [seoPullSchema.ts](../../convex/seoPullSchema.ts) |
| `seoDataPulls` | [seoPullSchema.ts](../../convex/seoPullSchema.ts) |
| `seoDayRollups` | [schema.ts](../../convex/schema.ts) |
| `seoKeywordIntents` | [schema.ts](../../convex/schema.ts) |
| `seoOperationCosts` | [schema.ts](../../convex/schema.ts) |
| `seoPullAnswers` | [schema.ts](../../convex/schema.ts) |
| `seoRunReports` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `seoWebsiteMetrics` | [schema.ts](../../convex/schema.ts) |
| `serpOverviews` | [aiAppSchema.ts](../../convex/aiAppSchema.ts) |
| `siteAnchorParts` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteBacklinks` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteCitedPages` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteCrawlLinks` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteCrawlPages` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteCrawls` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteDaySummaries` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteKeywordFeatures` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteKeywordRanks` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteLinkWeeks` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteListAiDays` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteListAiSummary` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteListCopies` | [siteRebuildSchema.ts](../../convex/siteRebuildSchema.ts) |
| `siteListCopyParts` | [siteRebuildSchema.ts](../../convex/siteRebuildSchema.ts) |
| `siteListQuestions` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `sitePageRanks` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `sitePageTypes` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `sitePaidKeywords` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteReferringDomainParts` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteReferringIpParts` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteSections` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteSerpPages` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `siteSitemapParts` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `siteSitemaps` | [pagesSchema.ts](../../convex/pagesSchema.ts) |
| `siteSummaryRequests` | [siteRebuildSchema.ts](../../convex/siteRebuildSchema.ts) |
| `swarmLogs` | [schema.ts](../../convex/schema.ts) |
| `systemConfig` | [schema.ts](../../convex/schema.ts) |
| `systemSettings` | [schema.ts](../../convex/schema.ts) |
| `tasks` | [schema.ts](../../convex/schema.ts) |
| `telegramBots` | [telegramSchema.ts](../../convex/telegramSchema.ts) |
| `telegramLinkCodes` | [telegramSchema.ts](../../convex/telegramSchema.ts) |
| `telegramLinks` | [telegramSchema.ts](../../convex/telegramSchema.ts) |
| `telegramWebhookUpdates` | [telegramSchema.ts](../../convex/telegramSchema.ts) |
| `threads` | [schema.ts](../../convex/schema.ts) |
| `toolConnectorOAuthConnections` | [schema.ts](../../convex/schema.ts) |
| `toolConnectorSecretRefs` | [schema.ts](../../convex/schema.ts) |
| `toolConnectorTestLogs` | [schema.ts](../../convex/schema.ts) |
| `toolConnectors` | [schema.ts](../../convex/schema.ts) |
| `topics` | [topicsSchema.ts](../../convex/topicsSchema.ts) |
| `uploadControl` | [uploadSchema.ts](../../convex/uploadSchema.ts) |
| `uploadQuotas` | [uploadSchema.ts](../../convex/uploadSchema.ts) |
| `uploadReservations` | [uploadSchema.ts](../../convex/uploadSchema.ts) |
| `userMemories` | [schema.ts](../../convex/schema.ts) |
| `userMemorySweeps` | [schema.ts](../../convex/schema.ts) |
| `users` | [schema.ts](../../convex/schema.ts) |
| `voiceTicketRedemptions` | [schema.ts](../../convex/schema.ts) |
| `webMentionParts` | [mentionSchema.ts](../../convex/mentionSchema.ts) |
| `webhookDeliveries` | [schema.ts](../../convex/schema.ts) |
| `websiteDataLimits` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `websiteIcons` | [siteSchema.ts](../../convex/siteSchema.ts) |
| `websiteKeywords` | [schema.ts](../../convex/schema.ts) |
| `websiteMoves` | [schema.ts](../../convex/schema.ts) |
| `websiteQuestionStats` | [schema.ts](../../convex/schema.ts) |
| `websiteQuestions` | [schema.ts](../../convex/schema.ts) |
| `websiteSearchStats` | [schema.ts](../../convex/schema.ts) |
| `websites` | [schema.ts](../../convex/schema.ts) |
| `weeklyDigestIssues` | [outboxSchema.ts](../../convex/outboxSchema.ts) |
| `widgets` | [schema.ts](../../convex/schema.ts) |
| `wikiAnswerTallies` | [schema.ts](../../convex/schema.ts) |
| `wikiDistillState` | [schema.ts](../../convex/schema.ts) |
| `wikiOpenQuestions` | [schema.ts](../../convex/schema.ts) |
| `wikiPageRevisions` | [schema.ts](../../convex/schema.ts) |
| `wikiPageSources` | [schema.ts](../../convex/schema.ts) |
| `wikiPages` | [schema.ts](../../convex/schema.ts) |
| `wikiReviews` | [schema.ts](../../convex/schema.ts) |
| `wikiUnansweredQuestions` | [schema.ts](../../convex/schema.ts) |
| `workflowExecutionSteps` | [schema.ts](../../convex/schema.ts) |
| `workflowExecutions` | [schema.ts](../../convex/schema.ts) |
| `workflows` | [schema.ts](../../convex/schema.ts) |
| `xConnections` | [newsSchema.ts](../../convex/newsSchema.ts) |

## Data Flow And Index Ownership

Identity/tenancy begins with users, companies, invitations and active-company helpers. Shared website identity and supplier results are distinct from private company holdings/lists. Customer report reads should use the existing compact projections and indexes, not collect an entire supplier table in a component. The [tenancy guide](./tenancy-enforcement.md) and owning integration guides explain which keys carry privacy and which results are intentionally shared.

Knowledge uploads use reservation/owner/purpose checks, then bounded extraction/chunking and retrieval. Wiki pages, source receipts, questions and revisions have their own state transitions. Agent runs, workflow executions and collection queues retain different recovery and idempotency evidence. A transaction cannot undo an external effect already performed in an action, and an internal function still depends on its caller passing consistent ownership.

Storage deletion, parent deletion and aggregate retention are separate contracts. `keepRules.ts` records table ownership/lifetimes, while `purges.ts` and feature-specific removals implement actual deletion. A bounded delete can leave related history; a permanent daily aggregate can survive raw event cleanup. Do not infer a cascade from a foreign-key-shaped ID, since Convex table references are not automatic SQL cascade constraints.

## Configuration, Errors, And Verification

Model/provider choices resolve stored use cases and capability policy. Text generation supports configured adapters; Decisions and media/embedding/grounding have specific boundaries. Credentials remain backend environment or secret references, never table catalog examples. [Environment variables](./convex-environment-variables.md) lists statically found names without their values; dynamic configuration names and external account setup require the owning guide.

Internal mutations/actions are not recovery buttons to invoke while reading documentation. Use allowlisted maintenance operations only in a separately authorized task with current state and effect review. Recorded SUCCESS can mean a queue insert, a contract check or a dispatch, rather than provider acceptance. Relevant tests are source evidence and should be traced through the feature guide, not mechanically counted as proof every entry in this table has passed live.

This reference was refreshed from current local source without executing application functions, schemas, migrations, external requests or tests. Generated API declarations can change while another worker edits the shared checkout; review relevant source changes before using this file as a fixed release artifact. Preserve PRODUCT.md intent, dated plans and historical verification records independently of this current lookup.
