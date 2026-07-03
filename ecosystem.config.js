module.exports = {
  apps: [
    {
      name: "crecent-change-apis",
      script: "./dist/server.js",

      instances: 1,
      exec_mode: "cluster",

      watch: false,

      autorestart: true,
      max_restarts: 10,
    }
  ]
};