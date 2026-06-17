FROM rust:1.95-bookworm AS build

WORKDIR /app
COPY . .
RUN cargo build --release -p write-cli -p write-api

FROM debian:bookworm-slim

RUN useradd --create-home --shell /usr/sbin/nologin appuser
COPY --from=build /app/target/release/writecheck /usr/local/bin/writecheck
COPY --from=build /app/target/release/write-api /usr/local/bin/write-api

USER appuser
ENV WRITECHECK_ADDR=0.0.0.0:3000
EXPOSE 3000
CMD ["write-api"]
