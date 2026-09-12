FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY cloud-app/package.json cloud-app/package-lock.json ./cloud-app/
RUN npm ci --prefix cloud-app
COPY . .
RUN npm --prefix cloud-app run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 MAHORAGA_STATE_DIR=/var/lib/mahoraga
COPY --from=build /app /app
RUN mkdir -p /var/lib/mahoraga && chown -R node:node /app /var/lib/mahoraga
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:3000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/cloud-service.mjs"]
