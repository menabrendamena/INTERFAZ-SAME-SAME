# Same Same

Validador de equivalencias de formulación entre productos labiales de gama alta y alternativas de gama económica, construido sobre listas de ingredientes en nomenclatura INCI, con precio de referencia en pesos mexicanos.

El sistema responde una sola pregunta: si la base química de una alternativa accesible sostiene la equivalencia que se le atribuye frente a un producto de gama alta. A esa respuesta le añade cuánto se ahorra. No evalúa tono ni desempeño en uso.

Este repositorio contiene la aplicación web. El cuaderno de punta a punta que produce los artefactos que aquí se consumen, junto con los datos de origen, vive en [menabrendamena/same-same](https://github.com/menabrendamena/same-same).

## Arquitectura

```
api/
  index.py                 servicio HTTP en FastAPI
  motor.py                 motor de recuperación, escala, precio y explicación
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

Los nueve artefactos que consume el motor se generan en la sección 17 del cuaderno de modelación y se copian a `api/datos/`: `catalogo_app.csv`, `tonos_app.csv`, `ingredientes_app.csv`, `perfil_app.csv`, `estadisticos_consulta_app.csv`, `pares_documentados.csv`, `precios_linea_app.csv`, `configuracion_app.json` e `indice_matriz_app.json`. La matriz completa, `matriz_similitud_app.csv`, se usa solo como referencia de validación y no la necesita el servicio.

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

La etiqueta se calcula siempre contra el universo completo de 498 fórmulas económicas. Los filtros de crueldad animal, origen vegano y formato restringen qué alternativas se muestran, nunca el juicio sobre cada una de ellas.

**Empates.** Numerosas candidatas comparten exactamente el mismo vehículo y, por lo tanto, la misma similitud. El coseno de dos vectores idénticos puede diferir en el último dígito según el procesador y el orden de las sumas, con diferencias del orden de 1e-16. Como el percentil depende del rango y los umbrales de la escala se aplican sobre el percentil, un empate roto por ese ruido cambiaría el nivel de una candidata. El rango se calcula con una tolerancia de `1e-12`, declarada en `configuracion_app.json` bajo `modelo.tolerancia_empate`, cuatro órdenes de magnitud por encima del ruido numérico y por debajo de cualquier diferencia real entre candidatas.

## Precio de referencia

Las listas de ingredientes no contienen precios y ningún minorista mexicano publica el surtido completo de las veinte marcas del catálogo. Los precios se levantaron a mano en una sola fecha, en minoristas con operación en México, y las líneas no observadas se completan con una jerarquía de estimación que usa siempre la información más cercana disponible:

| Nivel de evidencia | Criterio | Líneas |
|---|---|---|
| Observado en México | La línea tiene al menos una observación en tienda mexicana | 111 |
| Precio oficial en EE. UU. convertido | Marca con poca distribución local, convertida al tipo de cambio FIX | 22 |
| Estimado por marca y formato | Otros productos de la misma marca en el mismo formato | 263 |
| Estimado por modelo | Predicción del modelo log lineal de marca y formato | 152 |

Cada línea comercial expone un precio de referencia, que es el promedio de los precios regulares de su fuente y el valor con el que se calcula el ahorro, y un rango que va del precio más bajo accesible de forma habitual, con la promoción típica de su gama, al precio regular más alto observado. El nivel de evidencia se declara de forma explícita en la interfaz y en la API.

La estimación es multivariada, no una media global: el precio de un labial depende conjuntamente de quién lo fabrica y de qué tipo de producto es.

## Interfaz

| Sección | Contenido |
|---|---|
| Explorar | Catálogo de 548 líneas comerciales con búsqueda, ordenamiento por precio y filtros por gama, rango de precio, formato, efecto declarado, crueldad animal y aptitud vegana |
| Comparar | Comprobación de un par concreto, con veredicto en lenguaje llano, precios de ambos, ahorro, ingredientes compartidos y diferencias entre las dos fórmulas |
| Marcas | Las veinte marcas del catálogo con su gama, precio típico, clasificación ética y proporción de fórmulas veganas |
| Cómo funciona | Metodología, escala de etiquetas, origen de los precios, desempeño declarado, conjunto de referencia y límites del sistema |
| Sobre Same Same | Origen, alcance y honestidad del proyecto |

La capa de presentación agrupa las 645 fórmulas en 548 líneas comerciales. El modelo conserva las fórmulas intactas, porque dos acabados de un mismo producto comercial son dos vehículos químicos distintos.

**Dos niveles de lectura.** El flujo principal está escrito para quien compra un labial y no usa vocabulario estadístico. El percentil, la separación robusta, la posición dentro del catálogo, la descomposición del puntaje y el perfil funcional completo viven dentro de bloques plegables rotulados como detalle técnico, presentes en cada alternativa y en la comparación. Nada se elimina: se separa por perfil de lectura.

**Estado de los filtros.** Los filtros del catálogo viven en el fragmento de la dirección, no en memoria. Cambiar de sección los limpia por omisión, y una dirección con filtros puede compartirse tal cual.

**Panel de filtros.** En escritorio el panel queda fijo al costado del catálogo con altura acotada a la ventana y desplazamiento propio, de modo que todos los grupos quedan alcanzables sin recorrer la página. El encabezado del panel permanece visible mientras el contenido se desplaza y declara cuántos filtros hay activos. Por debajo de 880 píxeles el panel se convierte en una barra fija plegable que abre y cierra con un toque.

**Transparencia simétrica.** La clasificación de crueldad animal y la aptitud vegana se muestran siempre, en el catálogo, en la ficha de producto, en la lista de alternativas y en la comparación, tanto cuando el resultado es favorable como cuando no lo es. El sistema expone el dato y no ordena los resultados por ese criterio ni lo presenta como recomendación.

## API

| Ruta | Descripción |
|---|---|
| `GET /api/salud` | Estado del servicio y tamaño del catálogo |
| `GET /api/meta` | Configuración del modelo, umbrales de la escala, arquetipos, cobertura de precios y desempeño declarado |
| `GET /api/marcas` | Marcas con gama, precio típico, clasificación ética y proporción vegana |
| `GET /api/lineas` | Catálogo paginado con filtros, rango de precio, ordenamiento y búsqueda |
| `GET /api/producto/{id_formula}` | Ficha completa de una fórmula, con precio y perfil de construcción |
| `GET /api/alternativas/{id_formula}` | Alternativas económicas ordenadas por proximidad, con precio y ahorro |
| `GET /api/validar` | Veredicto sobre un par de fórmulas, con ahorro y explicación |
| `GET /api/comparar/{id_lujo}/{id_dupe}` | Descomposición del puntaje y diferencias entre dos fórmulas |
| `GET /api/precio/{id_formula}` | Precio de referencia y nivel de evidencia de una fórmula |
| `GET /api/pares-documentados` | Equivalencias documentadas por la comunidad con su veredicto y su ahorro |

La documentación interactiva se sirve en `/api/docs`.

## Ejecución local

```bash
pip install -r requirements.txt
uvicorn api.index:app --reload
```

La aplicación queda disponible en `http://127.0.0.1:8000`. En ejecución local el servicio monta además el directorio estático, de modo que un solo proceso sirve la interfaz y la API.

Las dependencias requieren una versión de Python para la que exista rueda precompilada de numpy. Si la instalación intenta compilar numpy desde el código fuente, la causa es que el intérprete es más reciente que la rueda disponible; basta con ejecutar los comandos con un intérprete 3.11, 3.12 o 3.13.

## Control de integridad

```bash
python validacion/validar_sistema.py
```

El control verifica en nueve grupos la integridad del catálogo, la reconstrucción de la matriz de similitud, la conservación del ordenamiento frente al ranking exportado, la reproducción exacta de los conteos de la capa de etiquetas, la estabilidad de los niveles ante una perturbación del orden de la precisión de máquina, la cobertura y coherencia de los precios, la consistencia de la descomposición del puntaje, la robustez de la recuperación bajo todas las combinaciones de filtros y la resolución de los pares documentados. Devuelve código de salida distinto de cero ante cualquier discrepancia.

## Despliegue

El repositorio está preparado para Vercel. La configuración enruta `/api/*` hacia la función de Python y sirve el resto desde el directorio estático. Al importar el repositorio, el preajuste de framework debe quedar en `Other`, para que Vercel respete el `vercel.json` del propio repositorio.

```bash
vercel
vercel --prod
```

## Fuentes

- **Listas de ingredientes.** Repositorio INKEEDecoder, consultado de forma estructurada y a bajo volumen tras verificar su archivo de exclusión para robots.
- **Precios.** Consulta manual en minoristas con operación en México en una sola fecha, más los precios de lista oficiales de las marcas con poca distribución local, convertidos al tipo de cambio FIX publicado en el Diario Oficial de la Federación.
- **Crueldad animal.** Contraste manual entre PETA y Cruelty-Free Kitty, con una categoría explícita para los casos en que ambas fuentes discrepan.
- **Equivalencias de referencia.** Pares documentados en comunidades de Reddit, TikTok y Pinterest, enlazados al catálogo mediante coincidencia difusa con revisión manual de los casos ambiguos.

## Límites conocidos

- Los precios corresponden a una sola fecha de consulta, no se normalizan por contenido neto y, en dos de cada cinco líneas, provienen de una estimación y no de una observación en tienda.
- La unidad de análisis es la base química sin colorantes, de manera que la equivalencia de tono debe confirmarse por separado.
- La regulación no obliga a declarar concentraciones, sólo el orden decreciente, de modo que el desempeño en uso no es deducible de la lista.
- El acabado y el efecto provienen de la nomenclatura comercial del producto: 358 de las 645 fórmulas no declaran acabado y 445 no declaran efecto. La ficha los complementa con atributos derivados de la propia fórmula.
- El catálogo cubre exclusivamente productos labiales de veinte marcas con presencia en el mercado mexicano.

## Siguientes pasos

- Vista de analista sobre los mismos artefactos: cobertura por marca y arquetipo, brechas de precio entre fórmulas equivalentes y consultas sin alternativa de nivel alto, que señalan oportunidades de surtido.
- Asistente conversacional encarnado en la vizcacha, la mascota de la marca, que interprete la consulta en lenguaje natural y resuelva mediante llamadas a funciones sobre esta misma API: `buscar_producto`, `validar_par`, `alternativas` y `precio`, cada una con esquema de salida estructurada. La restricción de diseño es que el asistente solo puede afirmar lo que las funciones devuelven, de modo que el veredicto lo sigue emitiendo el sistema calibrado y el modelo de lenguaje se limita a comprender la pregunta y a redactar la respuesta.
- Recolección periódica de precios en minoristas mexicanos, con registro del contenido neto para comparar precio por gramo o mililitro.
