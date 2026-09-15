import type { AlertEvent, SensorDevice, SensorReading } from "./types";
import {
  batteryLevel,
  sensorValueLevel,
  temperatureLevel,
} from "./thresholdPolicy";
import { tiltExceedMessage, tiltMagnitude } from "./tilt";

export type ThresholdHit = {
  type: AlertEvent["type"];
  severity: AlertEvent["severity"];
  message: string;
  value: number;
  threshold: number;
};

export function accelMagnitude(r: SensorReading): number {
  return tiltMagnitude(r.x, r.y, r.z);
}

export function evaluateReading(
  sensor: SensorDevice,
  reading: SensorReading
): ThresholdHit[] {
  const hits: ThresholdHit[] = [];
  const mag = accelMagnitude(reading);
  const accelState = sensorValueLevel(mag, sensor.thresholdTiltDeg);
  const tempState = temperatureLevel(
    reading.temperatureC,
    sensor.thresholdTempC
  );
  const batteryState = batteryLevel(
    reading.batteryPercent,
    sensor.thresholdBattery
  );

  if (accelState !== "normal") {
    hits.push({
      type: "accel",
      severity: accelState,
      message: tiltExceedMessage(mag),
      value: Number(mag.toFixed(3)),
      threshold: sensor.thresholdTiltDeg,
    });
  }

  if (reading.temperatureC != null && tempState !== "normal") {
    hits.push({
      type: "temp",
      severity: tempState,
      message: `온도 임계값 초과 (${reading.temperatureC.toFixed(1)}°C)`,
      value: reading.temperatureC,
      threshold: sensor.thresholdTempC,
    });
  }

  if (batteryState !== "normal") {
    hits.push({
      type: "battery",
      severity: batteryState,
      message: `배터리 임계값 미만 (${reading.batteryPercent}%)`,
      value: reading.batteryPercent,
      threshold: sensor.thresholdBattery,
    });
  }

  if (reading.hold) {
    hits.push({
      type: "hold",
      severity: "warning",
      message: "센서 Hold 상태 감지",
      value: 1,
      threshold: 0,
    });
  }

  return hits;
}

export function latestReading(
  readings: SensorReading[],
  deviceId: string
): SensorReading | undefined {
  return readings
    .filter((r) => r.deviceId === deviceId)
    .sort((a, b) => b.ts - a.ts)[0];
}

/** 이 시간 이상 연락이 없으면 오프라인으로 본다. */
export const OFFLINE_AFTER_MS = 30 * 60_000;

export function sensorStatus(
  sensor: SensorDevice,
  reading: SensorReading | undefined
): "ok" | "warning" | "critical" | "offline" | "inactive" {
  if (!sensor.isActive) return "inactive";
  if (!reading) return "offline";
  if (Date.now() - reading.ts > OFFLINE_AFTER_MS) return "offline";
  const hits = evaluateReading(sensor, reading);
  if (hits.some((h) => h.severity === "critical")) return "critical";
  if (hits.length) return "warning";
  return "ok";
}

/** 알림 생성 + MQTT publish 시도 */
export async function raiseAlerts(params: {
  sensor: SensorDevice;
  companyId: string;
  hits: ThresholdHit[];
}) {
  if (!params.hits.length) return [] as AlertEvent[];

  const created: AlertEvent[] = params.hits.map((hit) => ({
    id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    deviceId: params.sensor.deviceId,
    siteId: params.sensor.siteId,
    companyId: params.companyId,
    type: hit.type,
    severity: hit.severity,
    message: hit.message,
    value: hit.value,
    threshold: hit.threshold,
    acknowledged: false,
  }));

  for (const alert of created) {
    void publishMqttAlert(alert);
  }
  return created;
}

async function publishMqttAlert(alert: AlertEvent) {
  if (process.env.MQTT_ENABLED !== "true") return;
  try {
    const mqtt = await import("mqtt");
    const url = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
    const topic = process.env.MQTT_TOPIC_ALERTS || "eventhorizon/alerts";
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(url, { connectTimeout: 3000 });
      const timer = setTimeout(() => {
        client.end(true);
        reject(new Error("mqtt timeout"));
      }, 4000);
      client.on("connect", () => {
        client.publish(
          topic,
          JSON.stringify(alert),
          { qos: 1 },
          (err) => {
            clearTimeout(timer);
            client.end(true);
            if (err) reject(err);
            else resolve();
          }
        );
      });
      client.on("error", (err) => {
        clearTimeout(timer);
        client.end(true);
        reject(err);
      });
    });
  } catch (err) {
    console.warn("[mqtt] publish skipped:", (err as Error).message);
  }
}
