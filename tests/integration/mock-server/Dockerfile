FROM node:22-alpine

WORKDIR /app
COPY server.mjs .

ENV PORT=7990
ENV MOCK_TOKEN=test-token
EXPOSE 7990

HEALTHCHECK --interval=2s --timeout=2s --retries=10 \
    CMD wget -qO- --header="Authorization: Bearer test-token" http://localhost:7990/health || exit 1

CMD ["node", "server.mjs"]
