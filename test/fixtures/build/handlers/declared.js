// 非 index 文件导出 declare()：按模块入口规则注册为路由
export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/declared-nonindex' }
    ]
  };
}

export default async function () {
  return 'declared nonindex';
}
