FROM postgres:16-alpine
RUN apk add --no-cache age rclone tzdata
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0555 /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
