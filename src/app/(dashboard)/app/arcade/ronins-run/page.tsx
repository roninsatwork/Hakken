'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { Gamepad2, Trophy } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  nightHeistGame,
  NIGHT_HEIST_LEVELS,
  type NightHeistLevelId,
} from '@/convex/utils/nightHeistRules';
import { DataTable } from '@/src/ui/components/screens/DataTable';
import { PageHeader } from '@/src/ui/components/screens/PageHeader';
import Header from '@/src/ui/components/layout/Header';
import type { RunResult } from './engine/NightHeistSimulation';

const RoninCanvas = dynamic(() => import('./RoninCanvas'), { ssr: false });

export default function RoninArcadePage() {
  const t = useTranslations('arcade');
  const [currentPage, setCurrentPage] = useState(1),
    [search, setSearch] = useState('');
  const [selected, setSelected] = useState<NightHeistLevelId>('courtyard');
  const progress = useQuery(api.arcade.getNightHeistProgress, {});
  const levelId =
    NIGHT_HEIST_LEVELS.indexOf(selected) < (progress?.unlocked ?? 1) ? selected : 'courtyard';
  const game = nightHeistGame(levelId);
  const runId = useRef<Id<'arcadeRuns'> | null>(null);
  const startRun = useMutation(api.arcade.startNightHeistRun),
    finishRun = useMutation(api.arcade.finishNightHeistRun);
  const { results, status, loadMore } = usePaginatedQuery(
    api.arcade.getPaginatedLeaderboard,
    { game },
    { initialNumItems: 15 },
  );
  const count = useQuery(api.arcade.getScoresCount, { game }) ?? 0;
  const onStart = useCallback(async () => {
    runId.current = await startRun({ level: levelId });
  }, [startRun, levelId]);
  const onEscape = useCallback(
    async (result: RunResult) => {
      if (!runId.current) throw new Error('Missing run');
      await finishRun({
        runId: runId.current,
        elapsedSeconds: result.elapsedSeconds,
        treasure: result.treasure,
        alarms: result.alarms,
      });
    },
    [finishRun],
  );
  const filtered = search.trim()
    ? results.filter((row) => row.userName.toLowerCase().includes(search.trim().toLowerCase()))
    : results;
  const total = search.trim() ? filtered.length : Math.max(count, results.length);
  const totalPages = Math.max(1, Math.ceil(total / 15));
  const page = Math.min(currentPage, totalPages),
    rows = filtered.slice((page - 1) * 15, page * 15);
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="mt-2 flex flex-col gap-6 pb-8">
        <PageHeader
          divider
          icon={<Gamepad2 className="h-6 w-6 text-brand" />}
          title={t('title')}
          description={t('nightHeist.pageDescription')}
        />
        <RoninCanvas
          key={progress?.workspace ?? 'loading'}
          levelId={levelId}
          progress={progress}
          progressReady={!!progress}
          onLevelChange={(next) => {
            runId.current = null;
            setSelected(next);
            setSearch('');
            setCurrentPage(1);
          }}
          onStart={onStart}
          onEscape={onEscape}
        />
        <section className="flex flex-col gap-4">
          <PageHeader
            icon={<Trophy className="h-5 w-5 text-warning" />}
            title={t('leaderboardTitle')}
            description={t('nightHeist.mapLeaderboard', { name: t(`nightHeist.maps.${levelId}.name`) })}
          />
          <DataTable
            rows={
              (status === 'LoadingFirstPage' || status === 'LoadingMore') && !rows.length
                ? undefined
                : rows
            }
            rowKey={(row) => row._id}
            headerVariant="strip"
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value);
                setCurrentPage(1);
              },
              placeholder: t('searchPlaceholder'),
            }}
            empty={{ icon: <Trophy className="h-8 w-8 text-muted/30" />, label: t('emptyScores') }}
            footer={{
              mode: 'paged',
              page,
              totalPages,
              totalCount: total,
              pageSize: 15,
              isLoading: status === 'LoadingFirstPage' || status === 'LoadingMore',
              onPageChange: (next) => {
                setCurrentPage(next);
                if (next * 15 > results.length && status === 'CanLoadMore') loadMore(15);
              },
              labels: {
                empty: t('noAttempts'),
                showing: (start, end, totalCount) => t('showing', { start, end, total: totalCount }),
              },
            }}
            columns={[
              {
                key: 'rank',
                header: t('table.rank'),
                className: 'w-[80px]',
                cell: (row) => (
                  <span className="font-mono text-secondary">#{results.indexOf(row) + 1}</span>
                ),
              },
              {
                key: 'user',
                header: t('table.user'),
                cell: (row) => (
                  <div className="flex items-center gap-3">
                    {row.userAvatar ? (
                      <Image
                        src={row.userAvatar}
                        alt=""
                        width={30}
                        height={30}
                        unoptimized
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-sm text-brand">
                        {row.userName.charAt(0)}
                      </span>
                    )}
                    <span className="text-sm font-medium text-foreground">{row.userName}</span>
                  </div>
                ),
              },
              {
                key: 'score',
                header: t('table.score'),
                align: 'right',
                cell: (row) => (
                  <span className="font-mono text-base text-brand">{row.score.toLocaleString()}</span>
                ),
              },
              {
                key: 'date',
                header: t('table.timestamp'),
                align: 'right',
                cell: (row) => (
                  <span className="text-xs text-secondary">
                    {new Date(row.playedAt).toLocaleDateString()}
                  </span>
                ),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
