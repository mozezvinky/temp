import { assertProductionEnvReady } from "@/lib/production-env";

export function register() {
  assertProductionEnvReady();
}
