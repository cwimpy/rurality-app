# Deployment Guide for Rurality.app

This guide covers deploying Rurality.app to production.

## Prerequisites

Before deploying, ensure you have:

1. Node.js 16+ installed
2. A Census Bureau API key (optional but recommended)
3. A deployment platform account (Vercel, Netlify, or similar)

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required environment variables for production:

- `REACT_APP_CENSUS_API_KEY` - Get from https://api.census.gov/data/key_signup.html
- `REACT_APP_MAPBOX_TOKEN` - (Optional) For enhanced mapping
- `REACT_APP_GA_TRACKING_ID` - (Optional) For analytics
- `REACT_APP_ENV=production`

## Pre-Deployment Checklist

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

```bash
npm test
```

### 3. Build the Application

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

### 4. Test Production Build Locally

```bash
npm install -g serve
serve -s build
```

Visit http://localhost:3000 to test the production build.

## Deployment Options

### Option 1: Vercel (Recommended)

Vercel is optimized for React applications and provides excellent performance.

#### Deploy via CLI:

```bash
npm install -g vercel
vercel
```

#### Deploy via GitHub:

1. Push your code to GitHub
2. Visit https://vercel.com
3. Import your repository
4. Configure environment variables in Vercel dashboard
5. Deploy

**Configuration:**
- The `vercel.json` file is already configured
- Set environment variables in the Vercel dashboard
- Enable automatic deployments from your main branch

### Option 2: Netlify

#### Deploy via CLI:

```bash
npm install -g netlify-cli
netlify deploy --prod
```

#### Deploy via GitHub:

1. Push your code to GitHub
2. Visit https://app.netlify.com
3. Connect your repository
4. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `build`
5. Set environment variables
6. Deploy

**Configuration:**

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
```

### Option 3: AWS Amplify

1. Visit https://console.aws.amazon.com/amplify/
2. Connect your GitHub repository
3. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `build`
4. Set environment variables
5. Deploy

## Post-Deployment Steps

### 1. Verify Deployment

Test the following:
- [ ] Homepage loads correctly
- [ ] Location search works
- [ ] GPS location detection works
- [ ] Census data loads properly
- [ ] Map displays correctly
- [ ] CSV export functions
- [ ] Mobile responsiveness
- [ ] Error handling works

### 2. Configure Custom Domain

#### Vercel:
```bash
vercel domains add rurality.app
```

#### Netlify:
Settings → Domain management → Add custom domain

### 3. Set Up SSL/TLS

Both Vercel and Netlify provide automatic SSL certificates via Let's Encrypt.

### 4. Configure DNS

Point your domain to your deployment platform:

**For Vercel:**
- A record: 76.76.21.21
- CNAME record: cname.vercel-dns.com

**For Netlify:**
- Follow the DNS instructions in your Netlify dashboard

### 5. Enable Analytics (Optional)

Add Google Analytics or similar:

1. Get tracking ID from Google Analytics
2. Add to `.env.production`:
   ```
   REACT_APP_GA_TRACKING_ID=G-XXXXXXXXXX
   ```
3. Redeploy

### 6. Set Up Error Monitoring (Optional)

Consider integrating:
- Sentry for error tracking
- LogRocket for session replay
- New Relic for performance monitoring

## Performance Optimization

### Caching Strategy

The app implements client-side caching:
- Geocoding results: 1 hour
- Census data: 24 hours

### API Rate Limits

Built-in rate limiting protects against API throttling:
- Census API: 50 requests/minute
- Nominatim: 1 request/second

### CDN Configuration

Both Vercel and Netlify provide global CDN automatically.

## Monitoring

### Key Metrics to Monitor

1. **API Performance**
   - Census API response times
   - Geocoding success rate
   - Error rates

2. **User Metrics**
   - Page load time
   - Time to interactive
   - Search success rate

3. **Infrastructure**
   - Bandwidth usage
   - Request volume
   - Cache hit rates

## Troubleshooting

### Common Issues

#### 1. API Rate Limiting

**Problem:** Census API returns 429 errors

**Solution:**
- Get a Census API key to increase limits
- Verify rate limiter is working correctly
- Check cache is functioning

#### 2. Geocoding Failures

**Problem:** Location searches fail

**Solution:**
- Check Nominatim rate limiting (1 req/sec)
- Verify User-Agent header is set
- Consider adding Mapbox as fallback

#### 3. Build Failures

**Problem:** `npm run build` fails

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### 4. Tailwind Styles Not Working

**Problem:** Styles don't appear in production

**Solution:**
- Verify `tailwind.config.js` content paths are correct
- Check `postcss.config.js` exists
- Ensure `@tailwind` directives are in `index.css`

## Rollback Procedure

### Vercel:
```bash
vercel rollback
```

### Netlify:
1. Go to Deploys tab
2. Find previous successful deployment
3. Click "Publish deploy"

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **CORS**: Configured in `vercel.json`
3. **Rate Limiting**: Implemented client-side
4. **Input Validation**: All user inputs are sanitized
5. **Security Headers**: Set via deployment configuration

## Continuous Deployment

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

## Support

For deployment issues:
- Email: cwimpy@mac.com
- GitHub Issues: https://github.com/cwimpy/rurality-app/issues

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)
- [React Deployment Guide](https://create-react-app.dev/docs/deployment/)
- [Census API Documentation](https://www.census.gov/data/developers/guidance/api-user-guide.html)
