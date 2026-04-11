const teamEndpointItems = [
  {
    text: "POST /api/team/approval",
    link: "/api/team/approval",
  },
  {
    text: "POST /api/team/feedback",
    link: "/api/team/feedback",
  },
  {
    text: "GET /api/team/logs",
    link: "/api/team/logs",
  },
  {
    text: "POST /api/team/run",
    link: "/api/team/run",
  },
  {
    text: "GET /api/team/status",
    link: "/api/team/status",
  },
  {
    text: "GET /api/team/threads",
    link: "/api/team/threads/",
  },
  {
    text: "GET /api/team/threads/:threadId",
    link: "/api/team/threads/threadId",
  },
] as const;

const docsConfig = {
  title: "Meow Team",
  description: "Documentation for the owner harness team APIs and workspace guides.",
  cleanUrls: false,
  lastUpdated: true,
  themeConfig: {
    nav: [
      {
        text: "Home",
        link: "/",
      },
      {
        text: "Notifications",
        link: "/notification",
      },
      {
        text: "API Guide",
        link: "/api",
      },
      {
        text: "API Reference",
        link: "/api/",
      },
    ],
    sidebar: {
      "/": [
        {
          text: "Guides",
          items: [
            {
              text: "Overview",
              link: "/",
            },
            {
              text: "Desktop Notifications",
              link: "/notification",
            },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            {
              text: "Overview",
              link: "/api/",
            },
            ...teamEndpointItems,
          ],
        },
      ],
    },
  },
};

export default docsConfig;
