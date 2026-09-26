# Same Same

Validador de equivalencias de formulación entre productos labiales de gama alta y alternativas de gama económica, construido sobre listas de ingredientes en nomenclatura INCI.

El sistema responde una sola pregunta: si la base química de una alternativa accesible sostiene la equivalencia que se le atribuye frente a un producto de gama alta. No evalúa tono, precio ni desempeño en uso.

## Arquitectura

```
api/
  index.py                 servicio HTTP en FastAPI
  motor.py                 motor de recuperación, escala y explicación
  datos/                   artefactos exportados por la etapa de modelación
public/
  index.html               documento único de la aplicación
  estilos.css              sistema visual
  app.js                   enrutador por fragmento y vistas
validacion/
  validar_sistema.py       control de integridad del sistema desplegado
  matriz_similitud_app.csv matriz de referencia
  ranking_top50_04a.csv    ordenamiento de referencia
vercel.json                enrutamiento entre el front estático y la función
requirements.txt           dependencias de ejecución
```

El front es estático y consume la API por HTTP. No hay proceso de compilación ni dependencias de JavaScript.

## Modelo

Cada fórmula se representa mediante dos vectores derivados de su lista INCI:

1. **Vehículo.** Presencia binaria de los ingredientes que ocupan las primeras quince posiciones de la lista y superan el umbral mínimo de aparición en el catálogo. El decaimiento seleccionado es uniforme, de modo que toda posición dentro del corte pesa igual.
2. **Perfil funcional.** Veintinueve variables escaladas que describen la arquitectura de la fórmula: carga emoliente, control de viscosidad, sistema conservador, proporción de ingredientes por calificación editorial y posición del primer componente de cada familia, entre otras.

La similitud es la combinación convexa de la similitud coseno sobre ambas representaciones:

```
sim(u, v) = α · cos(vehículo_u, vehículo_v) + (1 − α) · cos(perfil_u, perfil_v)
```

con `α = 0.55`, valor seleccionado por validación dejando un ancla fuera sobre las equivalencias documentadas por la comunidad.

El motor reconstruye la matriz completa de 147 consultas por 498 candidatas en memoria al iniciar. La reconstrucción reproduce la matriz exportada por la etapa de modelación con una diferencia máxima de 2.98e-08, atribuible por completo al redondeo a precisión simple del archivo exportado, y conserva el ordenamiento sin una sola discrepancia en las 147 consultas.

## Escala de comparación

El valor absoluto del coseno no es comparable entre consultas, porque cada producto de gama alta enfrenta un universo de alternativas con dispersión propia. El sistema sitúa a cada candidata dentro de su propia consulta mediante dos magnitudes:

- **Percentil**, con empates resueltos por rango promedio, que indica qué porción del catálogo accesible queda por debajo de la candidata.
- **Separación robusta**, `(s − mediana) / (1.4826 · DAM)`, que mide cuánto sobresale la candidata respecto de la distribución completa de su consulta en unidades resistentes a valores extremos.

Sobre esas dos magnitudes se construye una escala de tres niveles con umbrales derivados de los datos:

| Nivel | Etiqueta | Condición |
|---|---|---|
| 1 | Equivalencia respaldada por la fórmula | percentil ≥ 99.0 y separación ≥ 2.479306 |
| 2 | Alternativa plausible con respaldo parcial | percentil ≥ 72.389558 |
| 3 | Sin respaldo de fórmula | resto del universo |

El umbral de separación del nivel más alto es el percentil diez de la separación que alcanza el primer candidato a lo largo de las consultas del catálogo. El umbral de percentil del nivel intermedio es la mediana del percentil que alcanzan las equivalencias documentadas.

La etiqueta se calcula siempre contra el universo completo de 498 fórmulas económicas. Los filtros de consumo responsable y de formato restringen qué alternativas se muestran, nunca el juicio sobre cada una de ellas.

## Interfaz

| Sección | Contenido |
|---|---|
| Explorar | Catálogo de 548 líneas comerciales con búsqueda, filtros por gama, formato, efecto declarado, crueldad animal y aptitud vegana |
| Validar | Comprobación de un par concreto, con veredicto, descomposición del puntaje y las equivalencias documentadas por la comunidad |
| Marcas | Las veinte marcas del catálogo con su gama, clasificación ética y proporción de fórmulas veganas |
| Cómo funciona | Metodología, escala de etiquetas, desempeño declarado y límites del sistema |
| Sobre Same Same | Origen, alcance y honestidad del proyecto |

La capa de presentación agrupa las 645 fórmulas en 548 líneas comerciales. El modelo conserva las fórmulas intactas, porque dos acabados de un mismo producto comercial son dos vehículos químicos distintos.

## API

| Ruta | Descripción |
|---|---|
| `GET /api/salud` | Estado del servicio y tamaño del catálogo |
| `GET /api/meta` | Configuración del modelo, umbrales de la escala, arquetipos y desempeño declarado |
| `GET /api/marcas` | Marcas con gama, clasificación ética y proporción vegana |
| `GET /api/lineas` | Catálogo paginado con filtros y búsqueda |
| `GET /api/producto/{id_formula}` | Ficha completa de una fórmula |
| `GET /api/alternativas/{id_formula}` | Alternativas económicas ordenadas por proximidad |
| `GET /api/validar` | Veredicto sobre un par de fórmulas |
| `GET /api/comparar/{id_lujo}/{id_dupe}` | Descomposición del puntaje entre dos fórmulas |
| `GET /api/pares-documentados` | Equivalencias documentadas por la comunidad con su veredicto |

La documentación interactiva se sirve en `/api/docs`.

## Ejecución local

```bash
pip install -r requirements.txt
uvicorn api.index:app --reload
```

La aplicación queda disponible en `http://127.0.0.1:8000`. En ejecución local el servicio monta además el directorio estático, de modo que un solo proceso sirve la interfaz y la API.

## Control de integridad

```bash
python validacion/validar_sistema.py
```

El control verifica la integridad del catálogo, la reconstrucción de la matriz de similitud, la conservación del ordenamiento frente al ranking exportado, la reproducción exacta de los conteos de la capa de etiquetas, la consistencia de la descomposición del puntaje y la robustez de la recuperación bajo todas las combinaciones de filtros. Devuelve código de salida distinto de cero ante cualquier discrepancia.

## Despliegue

El repositorio está preparado para Vercel. La configuración enruta `/api/*` hacia la función de Python e implanta el resto sobre el directorio estático.

```bash
vercel
vercel --prod
```

## Fuentes

- **Listas de ingredientes.** Repositorio INKEEDecoder, consultado de forma estructurada y a bajo volumen tras verificar su archivo de exclusión para robots.
- **Crueldad animal.** Contraste manual entre PETA y Cruelty-Free Kitty, con una categoría explícita para los casos en que ambas fuentes discrepan.
- **Equivalencias de referencia.** Pares documentados en comunidades de Reddit, TikTok y Pinterest, enlazados al catálogo mediante coincidencia difusa con revisión manual de los casos ambiguos.

## Límites conocidos

- La fuente de ingredientes es una base de formulación y no un sitio de comercio, de modo que no publica precios. El precio queda fuera del alcance.
- La unidad de análisis es la base química sin colorantes, de manera que la equivalencia de tono debe confirmarse por separado.
- La regulación no obliga a declarar concentraciones, sólo el orden decreciente, de modo que el desempeño en uso no es deducible de la lista.
- El catálogo cubre exclusivamente productos labiales de veinte marcas con presencia en el mercado mexicano.
