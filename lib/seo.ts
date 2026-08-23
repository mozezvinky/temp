export const siteUrl = "https://copic.co.ke";

export const homeSeo = {
  title: "COPIC Kenya | Find Reliable Workers & Local Services",
  description: "Find reliable workers for cleaning, moving, gardening, babysitting, shopping and other local services in Kenya. Post a job, choose your price and find the help you need with COPIC."
};

export function canonical(path = "/") {
  return new URL(path, siteUrl).toString();
}

