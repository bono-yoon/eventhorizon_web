"use client";

import dynamic from "next/dynamic";
import type { MapMarker, MapPath } from "./SiteMap";

const SiteMap = dynamic(
  () => import("./SiteMap").then((m) => m.SiteMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="eh-panel flex items-center justify-center rounded-2xl text-sm text-[var(--eh-fog)]"
        style={{ height: 420 }}
      >
        지도 로딩…
      </div>
    ),
  }
);

export function MapView(props: {
  markers: MapMarker[];
  height?: number;
  fill?: boolean;
  className?: string;
  enableZoomLayers?: boolean;
  preferSensorLayer?: boolean;
  paths?: MapPath[];
  focusId?: string;
}) {
  return <SiteMap {...props} />;
}
