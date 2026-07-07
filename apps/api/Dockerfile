FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install

COPY apps/api ./apps/api
RUN npm run build --workspace @waybill/api

FROM node:22-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
