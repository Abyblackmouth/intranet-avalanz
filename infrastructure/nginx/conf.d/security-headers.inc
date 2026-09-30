# Encabezados de seguridad del sitio. Se incluyen en cada location que define
# su propio add_header, porque en Nginx un add_header dentro de un location
# anula los heredados del server.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
