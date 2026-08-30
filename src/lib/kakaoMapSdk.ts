const KAKAO_MAP_SCRIPT_ID = "kakao-map-sdk";
const PLACEHOLDER = "YOUR_KAKAO_JAVASCRIPT_KEY_HERE";

let kakaoMapLoader: Promise<KakaoNamespace> | null = null;

export type KakaoNamespace = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoLatLngBounds;
    Map: new (
      container: HTMLElement,
      options: {
        center: KakaoLatLng;
        level: number;
        draggable?: boolean;
        scrollwheel?: boolean;
      }
    ) => KakaoMap;
    Marker: new (options: {
      position: KakaoLatLng;
      map?: KakaoMap | null;
      image?: KakaoMarkerImage;
      zIndex?: number;
      title?: string;
    }) => KakaoMarker;
    MarkerImage: new (
      src: string,
      size: KakaoSize,
      options?: { offset?: KakaoPoint }
    ) => KakaoMarkerImage;
    CustomOverlay: new (options: {
      position: KakaoLatLng;
      content: HTMLElement | string;
      map?: KakaoMap | null;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
      clickable?: boolean;
    }) => KakaoCustomOverlay;
    Polyline: new (options: {
      path: KakaoLatLng[];
      map?: KakaoMap | null;
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      zIndex?: number;
    }) => KakaoPolyline;
    Size: new (width: number, height: number) => KakaoSize;
    Point: new (x: number, y: number) => KakaoPoint;
    event: {
      addListener: (
        target: object,
        type: string,
        handler: (...args: unknown[]) => void
      ) => void;
      removeListener: (
        target: object,
        type: string,
        handler: (...args: unknown[]) => void
      ) => void;
    };
  };
};

export type KakaoLatLng = { getLat: () => number; getLng: () => number };
export type KakaoLatLngBounds = {
  extend: (latlng: KakaoLatLng) => void;
  isEmpty: () => boolean;
};
export type KakaoMap = {
  setCenter: (latlng: KakaoLatLng) => void;
  setBounds: (
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number
  ) => void;
  setLevel: (level: number) => void;
  relayout: () => void;
  getLevel: () => number;
};
export type KakaoMarker = {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (latlng: KakaoLatLng) => void;
};
export type KakaoCustomOverlay = {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (latlng: KakaoLatLng) => void;
  setZIndex: (z: number) => void;
};
export type KakaoPolyline = {
  setMap: (map: KakaoMap | null) => void;
  setPath: (path: KakaoLatLng[]) => void;
};
export type KakaoMarkerImage = object;
export type KakaoSize = object;
export type KakaoPoint = object;

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

function normalizeKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed || trimmed === "demo" || trimmed === PLACEHOLDER) return "";
  return trimmed;
}

async function getKakaoMapKey() {
  try {
    const res = await fetch("/api/public-config", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) {
      const config = (await res.json()) as { kakaoMapJsKey?: string };
      const fromApi = normalizeKey(String(config.kakaoMapJsKey || ""));
      if (fromApi) return fromApi;
    }
  } catch (err) {
    console.warn("[kakao] public-config unavailable:", err);
  }

  return normalizeKey(String(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY || ""));
}

function removeKakaoSdk() {
  if (typeof document === "undefined") return;
  document.getElementById(KAKAO_MAP_SCRIPT_ID)?.remove();
  document
    .querySelectorAll('script[src*="dapi.kakao.com/v2/maps/sdk.js"]')
    .forEach((script) => script.remove());
  if (typeof window !== "undefined") {
    delete window.kakao;
  }
  kakaoMapLoader = null;
}

export async function loadKakaoMapSdk(): Promise<KakaoNamespace> {
  const kakaoMapKey = await getKakaoMapKey();
  if (!kakaoMapKey) {
    return Promise.reject(new Error("Kakao JavaScript key is missing."));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Kakao map requires browser."));
  }

  if (window.kakao?.maps?.load) {
    return new Promise((resolve) => {
      window.kakao!.maps.load(() => resolve(window.kakao!));
    });
  }

  if (kakaoMapLoader) return kakaoMapLoader;

  kakaoMapLoader = new Promise((resolve, reject) => {
    removeKakaoSdk();

    const script = document.createElement("script");
    script.id = KAKAO_MAP_SCRIPT_ID;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      kakaoMapKey
    )}&autoload=false`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        kakaoMapLoader = null;
        reject(new Error("Kakao SDK loaded, but maps.load is unavailable."));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao!));
    };
    script.onerror = () => {
      kakaoMapLoader = null;
      reject(new Error("Failed to load Kakao map SDK script."));
    };
    document.head.appendChild(script);
  });

  return kakaoMapLoader;
}

export function getKakaoMapLoadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Kakao JavaScript key is missing.") {
    return "카카오 지도 키가 없습니다. .env.local 의 NEXT_PUBLIC_KAKAO_MAP_JS_KEY 를 설정한 뒤 개발 서버를 재시작하세요.";
  }
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";
  const host =
    typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `카카오 지도를 불러오지 못했습니다. JavaScript 키 앱에 Web 도메인으로 ${origin} (또는 ${host}) 이 등록됐는지, 127.0.0.1 이 아닌 localhost 로 접속 중인지 확인하세요.`;
}
