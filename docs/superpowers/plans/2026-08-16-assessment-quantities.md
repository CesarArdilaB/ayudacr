# Cantidades de la evaluación y corrección PQRSF

## Objetivo

Corregir el significado de la S en PQRSF y capturar cantidades estructuradas en los criterios que solicitan totales, preservando las evaluaciones existentes y la experiencia móvil.

## Contrato del recorrido

- Una persona evaluadora autenticada puede completar la evaluación desde un teléfono.
- Los seis criterios iniciales de dignidad muestran campos numéricos explícitos; el total de población separa hombres y mujeres.
- Cero es un valor válido. No se aceptan valores negativos ni decimales.
- Las cantidades se envían y persisten junto a la respuesta del criterio.
- Las evaluaciones existentes continúan siendo válidas mediante un valor JSON vacío por defecto.
- El criterio de PQRSF usa “sugerencias” y no “solicitudes”.

## Plan

1. Agregar pruebas fallidas para la terminología, metadatos y validación de cantidades.
2. Agregar pruebas fallidas de UI y persistencia del servidor.
3. Implementar el modelo compartido, los controles móviles y el guardado.
4. Generar la migración Drizzle, inspeccionar su SQL y aplicarla primero localmente y después en producción, verificando conteos.
5. Ejecutar verificación completa, desplegar y hacer una prueba de humo del recorrido en producción.
