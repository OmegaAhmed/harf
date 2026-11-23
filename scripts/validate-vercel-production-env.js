if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production deployment requires NODE_ENV=production.');
  }

  await import('../apps/api/src/config/env.js');
  console.log('Vercel production environment configuration is valid.');
}
