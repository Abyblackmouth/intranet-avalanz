FROM alpine:3.19

RUN apk add --no-cache postgresql-client

RUN mkdir -p /scripts /backups/cleanup /var/log/cron

COPY cleanup.sh /scripts/cleanup.sh
COPY rotate_backups.sh /scripts/rotate_backups.sh
COPY backup_postgres.sh /scripts/backup_postgres.sh
RUN chmod +x /scripts/cleanup.sh /scripts/rotate_backups.sh /scripts/backup_postgres.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
