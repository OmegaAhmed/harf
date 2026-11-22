export default function handler(_request, response) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({
    status: 'ok',
    source: 'vercel-diagnostic',
    project: 'harf-test'
  }));
}
