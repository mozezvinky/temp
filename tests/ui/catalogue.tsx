import { ServiceDiscovery } from "@/components/workers/ServiceDiscovery";
import { ServiceCatalogueManager } from "@/components/profile/ServiceCatalogueManager";
import { PostWorkWizard } from "@/components/jobs/PostWorkWizard";

// Isolated UI fixtures only: these never read or mutate production data.
import { skill, service, worker, client, job } from "./marketplace-data";
export function CatalogueFixture() {
  const mode = new URLSearchParams(location.search).get("state");
  if (mode === "worker") return <ServiceCatalogueManager skills={[skill]} onSaved={async () => {}} />;
  if (mode === "post") return <PostWorkWizard profile={client} initialJob={{ ...job, applicationDeadline: "2099-11-09T08:00:00Z" }} onClose={() => {}} onSubmitJob={async () => {}} />;
  return <ServiceDiscovery profile={client} workers={[worker, { ...worker, id: "worker-2", displayName: "Joy Beauty", skillProfiles: [{ ...skill, catalogue: [{ ...service, price: 900 }] }] }]} />;
}
