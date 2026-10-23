# Informes periódicos de seguridad

Auditoría de seguridad de la Intranet Avalanz: infraestructura, Docker, backend, frontend y servicios.

- **`auditoria.sh`**: se corre en int-avz (`bash security/informes-periodicos/auditoria.sh`). Solo lee: no cambia nada, no intenta ataques y nunca muestra contraseñas.
- **`INF-NNNN_AAAA-MM-DD.md`**: cada corrida genera un informe nuevo, numerado solo.
- **`acuses/ACU-NNNN_AAAA-MM-DD.md`**: la respuesta a cada informe, punto por punto: qué se corrigió, qué se acepta como riesgo y con qué justificación, responsable y fecha compromiso.

Frecuencia sugerida: mensual, y siempre antes de liberar algo que exponga datos o rutas públicas.
