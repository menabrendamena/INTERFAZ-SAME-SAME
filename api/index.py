"""Servicio HTTP de Same Same.

Expone el catálogo de fórmulas labiales, el precio de referencia de cada línea
comercial, la recuperación de alternativas económicas por similitud de
formulación y la comparación de equivalencias propuestas por la comunidad.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from motor import obtener_motor

RUTA_PARES = Path(__file__).resolve().parent / "datos" / "pares_documentados.csv"

app = FastAPI(
    title="Same Same",
    description=(
        "Validador de equivalencias de formulación entre labiales de gama alta y "
        "alternativas económicas, construido sobre listas de ingredientes INCI, con "
        "precio de referencia en pesos mexicanos por línea comercial."
    ),
    version="1.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _lista(valor: list[str] | None) -> list[str] | None:
    if not valor:
        return None
    limpio = [v.strip() for v in valor if v and v.strip()]
    return limpio or None


@app.get("/api/salud")
def salud() -> dict:
    motor = obtener_motor()
    return {
        "estado": "operativo",
        "formulas": len(motor.orden_formulas),
        "lineas_comerciales": len(motor.lineas),
        "lineas_con_precio": len(motor.precios),
        "consultas_disponibles": len(motor.ids_alta),
        "candidatas_disponibles": len(motor.ids_economica),
    }


@app.get("/api/meta")
def meta() -> dict:
    return obtener_motor().meta()


@app.get("/api/marcas")
def marcas() -> list[dict]:
    return obtener_motor().marcas()


@app.get("/api/lineas")
def lineas(
    gama: str | None = Query(default=None, pattern="^(alta|economica)?$"),
    marca: str | None = None,
    formato: str | None = None,
    efecto: str | None = None,
    etico: bool = False,
    vegano: bool = False,
    q: str | None = None,
    precio_desde: int | None = Query(default=None, ge=0),
    precio_hasta: int | None = Query(default=None, ge=0),
    orden: str = Query(default="marca", pattern="^(marca|nombre|precio-asc|precio-desc)$"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=24, ge=1, le=600),
) -> dict:
    return obtener_motor().listar_lineas(
        gama=gama,
        marca=marca,
        formato=formato,
        efecto=efecto,
        etico=etico,
        vegano=vegano,
        busqueda=q,
        precio_desde=precio_desde,
        precio_hasta=precio_hasta,
        orden=orden,
        pagina=pagina,
        por_pagina=por_pagina,
    )


@app.get("/api/producto/{id_formula}")
def producto(id_formula: str) -> dict:
    try:
        return obtener_motor().producto(id_formula.upper())
    except KeyError:
        raise HTTPException(status_code=404, detail="La fórmula solicitada no existe en el catálogo")


@app.get("/api/alternativas/{id_formula}")
def alternativas(
    id_formula: str,
    etico: bool = False,
    vegano: bool = False,
    formato: list[str] | None = Query(default=None),
    efecto: list[str] | None = Query(default=None),
    precio_hasta: int | None = Query(default=None, ge=0),
    n: int = Query(default=5, ge=1, le=50),
    agrupar_por_linea: bool = True,
) -> dict:
    try:
        return obtener_motor().alternativas(
            id_formula.upper(),
            etico=etico,
            vegano=vegano,
            formatos=_lista(formato),
            efectos=_lista(efecto),
            precio_hasta=precio_hasta,
            n=n,
            agrupar_por_linea=agrupar_por_linea,
        )
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail="La consulta debe corresponder a una fórmula de gama alta del catálogo",
        )


@app.get("/api/validar")
def validar(lujo: str, dupe: str) -> dict:
    try:
        return obtener_motor().validar(lujo.upper(), dupe.upper())
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=(
                "El par debe estar formado por una fórmula de gama alta y una fórmula de gama "
                "económica presentes en el catálogo"
            ),
        )


@app.get("/api/comparar/{id_lujo}/{id_dupe}")
def comparar(id_lujo: str, id_dupe: str) -> dict:
    motor = obtener_motor()
    if id_lujo.upper() not in motor.catalogo or id_dupe.upper() not in motor.catalogo:
        raise HTTPException(status_code=404, detail="Alguna de las fórmulas no existe en el catálogo")
    return motor.explicar(id_lujo.upper(), id_dupe.upper())


@app.get("/api/precio/{id_formula}")
def precio(id_formula: str) -> dict:
    motor = obtener_motor()
    registro = motor.precio_de(id_formula.upper())
    if registro is None:
        raise HTTPException(
            status_code=404, detail="No hay precio de referencia para esa fórmula"
        )
    return {"id_formula": id_formula.upper(), **registro}


@app.get("/api/pares-documentados")
def pares_documentados() -> dict:
    motor = obtener_motor()
    pares = motor.cargar_pares_documentados(RUTA_PARES)
    conteo = {1: 0, 2: 0, 3: 0}
    ahorros = []
    for par in pares:
        conteo[par["nivel"]] += 1
        if par["ahorro"] and par["ahorro"]["favorable"]:
            ahorros.append(par["ahorro"]["proporcion"])
    ahorros.sort()
    mediana = (
        round(ahorros[len(ahorros) // 2], 4)
        if len(ahorros) % 2
        else round((ahorros[len(ahorros) // 2 - 1] + ahorros[len(ahorros) // 2]) / 2, 4)
    ) if ahorros else None
    return {
        "total": len(pares),
        "resumen": {
            "confirmados": conteo[1],
            "parciales": conteo[2],
            "advertencias": conteo[3],
        },
        "ahorro_proporcional_mediano": mediana,
        "resultados": pares,
    }


@app.exception_handler(404)
def no_encontrado(_, excepcion) -> JSONResponse:
    detalle = getattr(excepcion, "detail", "Recurso no encontrado")
    return JSONResponse(status_code=404, content={"detalle": detalle})


DIRECTORIO_PUBLICO = Path(__file__).resolve().parent.parent / "public"

if DIRECTORIO_PUBLICO.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=DIRECTORIO_PUBLICO, html=True), name="publico")
