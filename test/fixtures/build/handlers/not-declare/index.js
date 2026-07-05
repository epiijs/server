// 文件系统兜底路由：无 declare()，自动生成 GET /health
export default async function () {
  return 'ok';
}
