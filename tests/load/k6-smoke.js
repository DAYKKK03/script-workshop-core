import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "60s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"]
  }
};

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3000";
const requestOptions = {
  headers: {
    "X-EdgeOne-Origin-Verify": __ENV.ORIGIN_SECRET || ""
  }
};

export default function smokeTest() {
  const home = http.get(`${baseUrl}/`, requestOptions);
  check(home, { "home is available": (response) => response.status === 200 });
  const login = http.get(`${baseUrl}/login`, requestOptions);
  check(login, { "login is available": (response) => response.status === 200 });
  sleep(1);
}
