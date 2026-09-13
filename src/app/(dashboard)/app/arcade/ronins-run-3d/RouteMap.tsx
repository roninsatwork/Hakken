import { useTranslations } from "next-intl";
import type { LevelDefinition } from "../ronins-run/engine/Levels";
import type { ViewState } from "./engine/FirstPersonGame";

export function RouteMap({
  level,
  state,
}: {
  level: LevelDefinition;
  state: ViewState;
}) {
  const t = useTranslations("arcade.firstPerson");
  const path = (polygon: readonly (readonly [number, number])[]) =>
    polygon.map((p) => p.join(",")).join(" ");
  return (
    <div className="rounded-xl border border-border-dim bg-background/90 p-2 sm:p-3 backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium text-foreground">
        {t("routeMap")}
      </p>
      <svg
        viewBox="0 0 1586 992"
        role="img"
        aria-label={t("mapLabel")}
        className="h-auto w-28 sm:w-44 lg:w-56"
      >
        {level.walkable.map((polygon, i) => (
          <polygon
            key={`path-${i}`}
            points={path(polygon)}
            className="fill-secondary/40 stroke-muted"
            strokeWidth="2"
          />
        ))}
        {level.blocked.map((polygon, i) => (
          <polygon
            key={`solid-${i}`}
            points={path(polygon)}
            className="fill-background stroke-muted"
            strokeWidth="4"
          />
        ))}
        {level.seals.map(
          (p, i) =>
            !state.collected.includes(i) && (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="25"
                className="fill-success"
              />
            ),
        )}
        {!state.spiritCollected && (
          <path
            d={`M${level.spirit.x},${level.spirit.y - 25} l22,25 -22,25 -22,-25 Z`}
            className="fill-info"
          />
        )}
        <rect
          x={level.exit.x - 22}
          y={level.exit.y - 22}
          width="44"
          height="44"
          className="fill-warning"
        />
        <g
          transform={`translate(${state.x} ${state.y}) rotate(${(-state.yaw * 180) / Math.PI})`}
        >
          <circle r="32" className="fill-background" />
          <path d="M0,-34 L23,24 L0,14 L-23,24 Z" className="fill-foreground" />
        </g>
      </svg>
      <p className="mt-1 hidden max-w-56 text-[10px] sm:block text-secondary">
        {t("mapLegend")}
      </p>
    </div>
  );
}
