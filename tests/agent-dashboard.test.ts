import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks, load, nodes } from "./auth-harness";

test("existing agents default to worker mode and switch both ways without navigation or identity changes", async () => {
  const h = hooks(), requests: string[] = [];
  const summary = { earned: 45, available: 0, pending: 45, completedJobs: 1, net: 4500 };
  const user = { uid: "existing-agent" };
  const page = await load("app/agent/page.tsx", {
    react: h.react, "next/link": "link", "@/components/ui/Button": { Button: "button" }, "@/components/ui/Card": { Card: "card" },
    "@/hooks/useProtectedRoute": { useProtectedRoute: () => ({ user, profile: { agentEnabled: true }, loading: false, isAuthorized: true }) },
    "@/hooks/useOperationalData": { useOperationalData: (path: string) => { requests.push(path); return { data: { enabled: true, client: summary, worker: summary, combined: { earned: 90, available: 0 }, metrics: {}, clientCode: "code", links: [], workers: [], clients: [], jobs: [], proposals: [], records: [] }, refresh() {} }; } },
    "@/components/jobs/PostWorkWizard": { PostWorkWizard: "wizard" }, "@/components/admin/AcquisitionFunnel": { AcquisitionFunnel: "funnel" }
  }, {});
  let tree = h.render(page.default), tabs = nodes(tree).filter(n => n.props?.role === "tab");
  assert.equal(tabs[1].props["aria-selected"], true);
  tabs[0].props.onClick(); tree = h.render(page.default);
  assert.equal(nodes(tree).find(n => n.props?.role === "tabpanel")?.props["aria-labelledby"], "tab-CLIENT_AGENT");
  assert.ok(nodes(tree).some(n => n.type === "h3" && n.props.children === "Post a Job for a Client"));
  tabs = nodes(tree).filter(n => n.props?.role === "tab"); tabs[1].props.onClick(); tree = h.render(page.default);
  assert.equal(nodes(tree).find(n => n.props?.role === "tabpanel")?.props["aria-labelledby"], "tab-WORKER_AGENT");
  assert.ok(requests.every(path => path === "/api/agent/overview"));
  assert.ok(nodes(tree).find(n => n.props?.role === "tablist")?.props.className.includes("grid-cols-2"));
  assert.equal(user.uid, "existing-agent");
});
