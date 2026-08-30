/**
 * MQTT 알림 구독 테스트
 * 사용: MQTT_URL=mqtt://127.0.0.1:1883 node scripts/mqtt-subscribe.mjs
 */
import mqtt from "mqtt";

const url = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const topic = process.env.MQTT_TOPIC_ALERTS || "eventhorizon/alerts";

const client = mqtt.connect(url);
client.on("connect", () => {
  console.log("connected", url);
  client.subscribe(topic, (err) => {
    if (err) console.error(err);
    else console.log("subscribed", topic);
  });
});
client.on("message", (t, payload) => {
  console.log(`[${t}]`, payload.toString());
});
client.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
