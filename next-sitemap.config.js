/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://prechop.com.ng',
  generateRobotsTxt: true,
  exclude: [
    "/api/*",
    "/admin/*",
    "/vendor/*",
    "/account/*",
    "/dashboard/*",
    "/earnings/*",
    "/orders/*",
    "/settings/*",
    "/login",
  ],
  changefreq: 'daily',
  priority: 0.7,
}