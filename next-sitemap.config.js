/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://prechop.com.ng',
  generateRobotsTxt: true,
  exclude: [
    '/vendor/*',
    '/admin/*',
    '/buyer/*',
    '/api/*',
  ],
  changefreq: 'daily',
  priority: 0.7,
}