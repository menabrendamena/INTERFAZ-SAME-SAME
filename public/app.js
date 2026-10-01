(() => {
  "use strict";

  const BASE = "/api";
  const contenido = document.getElementById("contenido");

  const estado = { meta: null, marcas: null };

  const FILTROS_POR_OMISION = {
    q: "",
    gama: "",
    formato: "",
    efecto: "",
    marca: "",
    precio: "",
    etico: false,
    vegano: false,
    orden: "marca",
    pagina: 1
  };

  const RANGOS_PRECIO = [
    { clave: "", texto: "Cualquier precio" },
    { clave: "0-150", texto: "Hasta $150" },
    { clave: "150-300", texto: "De $150 a $300" },
    { clave: "300-600", texto: "De $300 a $600" },
    { clave: "600-", texto: "Más de $600" }
  ];

  const ORDENES = [
    { clave: "marca", texto: "Marca y nombre" },
    { clave: "precio-asc", texto: "Precio, de menor a mayor" },
    { clave: "precio-desc", texto: "Precio, de mayor a menor" },
    { clave: "nombre", texto: "Nombre del producto" }
  ];

  const NIVEL_LLANO = {
    1: "Se parece por dentro",
    2: "Se parece a medias",
    3: "No se parece por dentro"
  };

  const GLOSARIO = [
    ["la base química visible para el modelo", "la fórmula que el sistema compara"],
    ["base química visible para el modelo", "fórmula que el sistema compara"],
    ["Coincidencias poco comunes en el catálogo", "Coinciden en ingredientes poco frecuentes del catálogo"],
    ["del resto de su universo", "del resto de las alternativas"],
    ["de su universo", "de las demás alternativas"],
    ["catálogo accesible", "catálogo económico"],
    ["arquitectura funcional", "construcción de la fórmula"],
    ["visible para el modelo", "que el sistema compara"],
    ["fórmula base", "fórmula"],
    ["base química", "fórmula"],
    ["igual de próximas", "igual de parecidas"],
    ["igual de próximo", "igual de parecido"],
    ["más próximas", "más parecidas"],
    ["más próximos", "más parecidos"]
  ];

  const TINTES = [
    ["#EFE8E1", "#E3D8CE"],
    ["#DFEDD8", "#CBE2C0"],
    ["#F8DAE3", "#F1C2D1"],
    ["#DCEBE6", "#C4DDD6"],
    ["#E6DFEE", "#D4C9E3"],
    ["#FCE5D2", "#F7D0B4"],
    ["#DEE8F1", "#C7D8E8"]
  ];

  const NOMBRE_FORMATO = {
    barra: "Barra",
    gloss: "Gloss",
    balsamo: "Bálsamo",
    aceite: "Aceite",
    delineador: "Delineador",
    tinte: "Tinte",
    liquido: "Líquido"
  };

  // --------------------------------------------------------------------
  // Utilidades
  // --------------------------------------------------------------------
  async function api(ruta, parametros) {
    const url = new URL(BASE + ruta, window.location.origin);
    if (parametros) {
      Object.entries(parametros).forEach(([clave, valor]) => {
        if (valor === "" || valor === null || valor === undefined || valor === false) return;
        if (Array.isArray(valor)) valor.forEach((v) => url.searchParams.append(clave, v));
        else url.searchParams.set(clave, valor);
      });
    }
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      throw new Error(cuerpo.detalle || cuerpo.detail || "No fue posible completar la consulta");
    }
    return respuesta.json();
  }

  const esc = (texto) =>
    String(texto ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function llano(texto) {
    let resultado = String(texto ?? "");
    GLOSARIO.forEach(([tecnico, sencillo]) => {
      resultado = resultado.split(tecnico).join(sencillo);
    });
    return resultado;
  }

  const pesos = (valor) =>
    valor === null || valor === undefined ? "" : "$" + Math.round(valor).toLocaleString("es-MX");

  const porcentaje = (valor, decimales = 0) => (valor * 100).toFixed(decimales) + "%";

  const semilla = (texto) => {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i += 1) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  };

  function huella(producto, alto = 150) {
    const arquetipo = producto.arquetipo ?? 0;
    const [claro, oscuro] = TINTES[arquetipo % TINTES.length];
    const clave = producto.id_formula || producto.clave_linea || "same";
    const base = semilla(clave);
    const barras = Math.max(5, Math.min(producto.n_ingredientes_base || 10, 15));
    const id = "g" + base.toString(36);

    const alto_util = 74;
    const paso = alto_util / barras;
    const grosor = Math.max(1.6, Math.min(paso * 0.52, 4.4));

    let trazos = "";
    for (let i = 0; i < barras; i += 1) {
      const decaimiento = Math.pow(1 - i / (barras + 2), 1.25);
      const ruido = 0.72 + (((base >> (i % 13)) % 29) / 29) * 0.28;
      const ancho = 14 + 118 * decaimiento * ruido;
      const y = 15 + i * paso;
      trazos += `<rect x="14" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${grosor.toFixed(1)}" rx="${(grosor / 2).toFixed(1)}" fill="#fff" opacity="${(0.82 - i * (0.5 / barras)).toFixed(2)}"/>`;
    }

    return `<svg class="huella" viewBox="0 0 160 104" preserveAspectRatio="none" role="img" aria-label="Representación gráfica del orden de declaración de la fórmula" style="height:${alto}px">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${claro}"/><stop offset="100%" stop-color="${oscuro}"/>
      </linearGradient></defs>
      <rect width="160" height="104" fill="url(#${id})"/>
      <circle cx="138" cy="${20 + (base % 60)}" r="${16 + (base % 11)}" fill="#fff" opacity=".2"/>
      ${trazos}
    </svg>`;
  }

  function distintivoEtico(registro) {
    if (registro.clasificacion_etica === "libre de crueldad animal")
      return '<span class="distintivo distintivo--etico">Libre de crueldad animal</span>';
    if (registro.clasificacion_etica === "evidencia contradictoria")
      return '<span class="distintivo distintivo--gris-etico">Evidencia contradictoria</span>';
    return '<span class="distintivo distintivo--neutro">No libre de crueldad animal</span>';
  }

  function distintivoVegano(registro) {
    const clase = registro.aptitud_vegana === "vegana por fórmula" ? "distintivo--vegano" : "distintivo--neutro";
    const texto =
      {
        "vegana por fórmula": "Vegana por fórmula",
        "depende del tono": "Depende del tono",
        "no vegana": "No vegana",
        "origen incierto": "Origen incierto"
      }[registro.aptitud_vegana] || registro.aptitud_vegana;
    return `<span class="distintivo ${clase}">${esc(texto)}</span>`;
  }

  const distintivoGama = (gama) =>
    gama === "alta"
      ? '<span class="distintivo distintivo--alta">Gama alta</span>'
      : '<span class="distintivo distintivo--economica">Gama económica</span>';

  const distintivoNivel = (nivel) =>
    `<span class="distintivo nivel-${nivel}"><span class="punto-nivel n${nivel}"></span>${esc(NIVEL_LLANO[nivel])}</span>`;

  const nombreFormato = (registro) =>
    registro.formato_nombre || NOMBRE_FORMATO[registro.formato] || registro.formato;

  function distintivoAhorro(ahorro) {
    if (!ahorro) return "";
    const clase = ahorro.favorable ? "ahorro" : "ahorro ahorro--adverso";
    const proporcion = ahorro.favorable
      ? `<span class="ahorro__proporcion">${porcentaje(ahorro.proporcion)} menos</span>`
      : "";
    return `<span class="${clase}">${esc(ahorro.texto)}${proporcion}</span>`;
  }

  function precioEnTarjeta(precio) {
    if (!precio) return "";
    return `<span class="precio-tarjeta">
      <span class="precio-tarjeta__rango">${esc(precio.texto.replace(" MXN", ""))}</span>
      <span class="precio-tarjeta__nota">MXN</span>
    </span>`;
  }

  function tarjetaLinea(linea) {
    const tonos =
      linea.n_formulas > 1
        ? `<span class="distintivo distintivo--neutro">${linea.n_formulas} fórmulas</span>`
        : "";
    return `<a class="tarjeta" href="#/producto/${esc(linea.id_representante)}">
      ${huella({ id_formula: linea.id_representante, arquetipo: linea.arquetipo, n_ingredientes_base: linea.n_ingredientes_base }, 128)}
      <span class="tarjeta__marca">${esc(linea.marca)}</span>
      <span class="tarjeta__nombre">${esc(linea.nombre)}</span>
      ${precioEnTarjeta(linea.precio)}
      <span class="tarjeta__pie">
        ${distintivoGama(linea.gama)}
        <span class="distintivo distintivo--neutro">${esc(nombreFormato(linea))}</span>
        ${tonos}
      </span>
    </a>`;
  }

  const cargando = () =>
    '<div class="cargando"><span class="cargando__punto"></span><span class="cargando__punto"></span><span class="cargando__punto"></span></div>';

  function pintar(html) {
    contenido.innerHTML = `<div class="contenedor">${html}</div>`;
  }

  function error(mensaje) {
    pintar(`<div class="vacio"><h3>Algo no salió bien</h3><p>${esc(mensaje)}</p>
      <a class="boton boton--secundario" href="#/explorar">Volver a explorar</a></div>`);
  }

  async function asegurarMeta() {
    if (!estado.meta) estado.meta = await api("/meta");
    return estado.meta;
  }

  async function asegurarMarcas() {
    if (!estado.marcas) estado.marcas = await api("/marcas");
    return estado.marcas;
  }

  function limitesPrecio(clave) {
    if (!clave) return {};
    const [desde, hasta] = clave.split("-");
    const salida = {};
    if (desde) salida.precio_desde = Number(desde);
    if (hasta) salida.precio_hasta = Number(hasta);
    return salida;
  }

  // --------------------------------------------------------------------
  // Explorar
  // --------------------------------------------------------------------
  async function vistaExplorar(parametros) {
    pintar(cargando());
    const meta = await asegurarMeta();
    const marcas = await asegurarMarcas();

    const filtros = { ...FILTROS_POR_OMISION };
    Object.keys(FILTROS_POR_OMISION).forEach((clave) => {
      if (parametros[clave] === undefined) return;
      if (clave === "etico" || clave === "vegano") filtros[clave] = parametros[clave] === "1";
      else if (clave === "pagina") filtros.pagina = Math.max(1, Number(parametros.pagina) || 1);
      else filtros[clave] = parametros[clave];
    });

    function sincronizarDireccion() {
      const consulta = new URLSearchParams();
      Object.entries(filtros).forEach(([clave, valor]) => {
        if (valor === FILTROS_POR_OMISION[clave]) return;
        consulta.set(clave, valor === true ? "1" : String(valor));
      });
      const texto = consulta.toString();
      history.replaceState(null, "", "#/explorar" + (texto ? "?" + texto : ""));
    }

    const c = meta.catalogo;
    const fichasFormato = meta.filtros.formatos
      .map(
        (f) =>
          `<button class="ficha" type="button" data-formato="${esc(f)}" aria-pressed="${filtros.formato === f}">
            ${esc(NOMBRE_FORMATO[f] || f)} <span style="opacity:.55">${meta.filtros.conteo_formatos[f]}</span>
          </button>`
      )
      .join("");

    const marcasAlta = marcas.filter((m) => m.gama === "alta");
    const marcasEco = marcas.filter((m) => m.gama === "economica");
    const opcionMarca = (m) =>
      `<option value="${esc(m.marca)}"${filtros.marca === m.marca ? " selected" : ""}>${esc(m.marca)}</option>`;
    const opcionesMarca = `<option value="">Todas las marcas</option>
      <optgroup label="Gama alta">${marcasAlta.map(opcionMarca).join("")}</optgroup>
      <optgroup label="Gama económica">${marcasEco.map(opcionMarca).join("")}</optgroup>`;

    pintar(`
      <section class="portada">
        <h1 class="portada__titulo">Descubre. Compara. <span class="acento">Ahorra.</span></h1>
        <p class="portada__bajada">Same Same abre la lista de ingredientes de ${c.formulas} labiales, te dice si una opción económica se parece de verdad por dentro al producto de gama alta que tienes en la mira, y cuánto te ahorras en pesos.</p>
        <div class="buscador">
          <svg class="buscador__lupa" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="search" id="campo-busqueda" placeholder="Busca una marca o un producto" value="${esc(filtros.q)}" aria-label="Buscar una marca o un producto">
        </div>
        <div class="portada__cifras">
          <div><span class="cifra__valor">${c.formulas}</span><span class="cifra__texto">fórmulas analizadas</span></div>
          <div><span class="cifra__valor">${c.marcas}</span><span class="cifra__texto">marcas</span></div>
          <div><span class="cifra__valor">${meta.precios.lineas_con_precio}</span><span class="cifra__texto">precios de referencia</span></div>
          <div><span class="cifra__valor">${c.ingredientes_distintos}</span><span class="cifra__texto">ingredientes comparados</span></div>
        </div>
      </section>

      <section class="bloque">
        <div class="bloque__encabezado">
          <h2>Explora por tipo de labial</h2>
          <p class="bloque__nota">El catálogo cubre exclusivamente productos para labios.</p>
        </div>
        <div class="fichas" id="fichas-formato">
          <button class="ficha" type="button" data-formato="" aria-pressed="${filtros.formato === ""}">Todos</button>
          ${fichasFormato}
        </div>
      </section>

      <div class="disposicion">
        <aside class="panel panel--pegado">
          <p class="panel__titulo">Filtros <button class="panel__limpiar" type="button" id="limpiar-filtros">Limpiar</button></p>
          <div class="grupo-filtro">
            <p class="grupo-filtro__titulo">Gama</p>
            <label class="opcion"><input type="radio" name="gama" value=""${filtros.gama === "" ? " checked" : ""}><span>Todas</span></label>
            <label class="opcion"><input type="radio" name="gama" value="alta"${filtros.gama === "alta" ? " checked" : ""}><span>Alta</span></label>
            <label class="opcion"><input type="radio" name="gama" value="economica"${filtros.gama === "economica" ? " checked" : ""}><span>Económica</span></label>
          </div>
          <div class="grupo-filtro">
            <p class="grupo-filtro__titulo">Precio de referencia</p>
            ${RANGOS_PRECIO.map(
              (r) =>
                `<label class="opcion"><input type="radio" name="precio" value="${esc(r.clave)}"${filtros.precio === r.clave ? " checked" : ""}><span>${esc(r.texto)}</span></label>`
            ).join("")}
          </div>
          <div class="grupo-filtro">
            <p class="grupo-filtro__titulo">Consumo responsable</p>
            <label class="opcion"><input type="checkbox" id="filtro-etico"${filtros.etico ? " checked" : ""}><span>Solo libres de crueldad animal</span></label>
            <label class="opcion"><input type="checkbox" id="filtro-vegano"${filtros.vegano ? " checked" : ""}><span>Solo veganas por fórmula</span></label>
          </div>
          <div class="grupo-filtro">
            <p class="grupo-filtro__titulo">Marca</p>
            <select id="filtro-marca">${opcionesMarca}</select>
          </div>
          <div class="grupo-filtro">
            <p class="grupo-filtro__titulo">Efecto declarado</p>
            <select id="filtro-efecto">
              <option value="">Cualquiera</option>
              ${meta.filtros.efectos
                .map(
                  (e) =>
                    `<option value="${esc(e)}"${filtros.efecto === e ? " selected" : ""}>${esc(e)} (${meta.filtros.conteo_efectos[e]})</option>`
                )
                .join("")}
            </select>
          </div>
        </aside>

        <section>
          <div class="bloque__encabezado">
            <h2 id="titulo-resultados">Catálogo</h2>
            <div class="barra-orden">
              <label for="filtro-orden">Ordenar por</label>
              <select id="filtro-orden">
                ${ORDENES.map(
                  (o) =>
                    `<option value="${esc(o.clave)}"${filtros.orden === o.clave ? " selected" : ""}>${esc(o.texto)}</option>`
                ).join("")}
              </select>
            </div>
          </div>
          <p class="bloque__nota" id="conteo-resultados" style="margin-bottom:16px"></p>
          <div id="resultados">${cargando()}</div>
          <div id="paginacion"></div>
        </section>
      </div>
    `);

    async function cargarResultados() {
      const caja = document.getElementById("resultados");
      if (!caja) return;
      caja.innerHTML = cargando();
      sincronizarDireccion();
      try {
        const datos = await api("/lineas", {
          q: filtros.q,
          gama: filtros.gama,
          marca: filtros.marca,
          formato: filtros.formato,
          efecto: filtros.efecto,
          etico: filtros.etico,
          vegano: filtros.vegano,
          orden: filtros.orden,
          pagina: filtros.pagina,
          por_pagina: 24,
          ...limitesPrecio(filtros.precio)
        });

        document.getElementById("conteo-resultados").textContent =
          datos.total === 0
            ? "Sin coincidencias"
            : `${datos.total} ${datos.total === 1 ? "producto" : "productos"} en el catálogo`;

        caja.innerHTML = datos.resultados.length
          ? `<div class="rejilla">${datos.resultados.map(tarjetaLinea).join("")}</div>`
          : `<div class="vacio"><h3>Ningún producto cumple esos criterios</h3>
               <p>Prueba a quitar un filtro o a buscar por el nombre de la marca.</p></div>`;

        const paginacion = document.getElementById("paginacion");
        if (datos.paginas > 1) {
          paginacion.innerHTML = `<div class="paginacion">
            <button class="boton boton--secundario" id="pagina-anterior"${datos.pagina <= 1 ? " disabled" : ""}>Anterior</button>
            <span class="paginacion__texto">Página ${datos.pagina} de ${datos.paginas}</span>
            <button class="boton boton--secundario" id="pagina-siguiente"${datos.pagina >= datos.paginas ? " disabled" : ""}>Siguiente</button>
          </div>`;
          const anterior = document.getElementById("pagina-anterior");
          const siguiente = document.getElementById("pagina-siguiente");
          if (anterior)
            anterior.addEventListener("click", () => {
              filtros.pagina -= 1;
              cargarResultados();
              window.scrollTo({ top: 300 });
            });
          if (siguiente)
            siguiente.addEventListener("click", () => {
              filtros.pagina += 1;
              cargarResultados();
              window.scrollTo({ top: 300 });
            });
        } else {
          paginacion.innerHTML = "";
        }
      } catch (e) {
        caja.innerHTML = `<div class="vacio"><h3>No fue posible cargar el catálogo</h3><p>${esc(e.message)}</p></div>`;
      }
    }

    let temporizador;
    document.getElementById("campo-busqueda").addEventListener("input", (evento) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        filtros.q = evento.target.value.trim();
        filtros.pagina = 1;
        cargarResultados();
      }, 260);
    });

    document.getElementById("fichas-formato").addEventListener("click", (evento) => {
      const boton = evento.target.closest(".ficha");
      if (!boton) return;
      filtros.formato = boton.dataset.formato;
      filtros.pagina = 1;
      document
        .querySelectorAll("#fichas-formato .ficha")
        .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.formato === filtros.formato)));
      cargarResultados();
    });

    document.querySelectorAll('input[name="gama"]').forEach((radio) =>
      radio.addEventListener("change", (e) => {
        filtros.gama = e.target.value;
        filtros.pagina = 1;
        cargarResultados();
      })
    );
    document.querySelectorAll('input[name="precio"]').forEach((radio) =>
      radio.addEventListener("change", (e) => {
        filtros.precio = e.target.value;
        filtros.pagina = 1;
        cargarResultados();
      })
    );
    ["etico", "vegano"].forEach((clave) =>
      document.getElementById("filtro-" + clave).addEventListener("change", (e) => {
        filtros[clave] = e.target.checked;
        filtros.pagina = 1;
        cargarResultados();
      })
    );
    ["marca", "efecto", "orden"].forEach((clave) =>
      document.getElementById("filtro-" + clave).addEventListener("change", (e) => {
        filtros[clave] = e.target.value;
        filtros.pagina = 1;
        cargarResultados();
      })
    );
    document.getElementById("limpiar-filtros").addEventListener("click", () => {
      window.location.hash = "#/explorar";
    });

    cargarResultados();
  }

  // --------------------------------------------------------------------
  // Producto
  // --------------------------------------------------------------------
  function barrasPerfil(lista) {
    return `<div class="perfil">${lista
      .map(
        (v) => `<div class="perfil__fila">
          <span class="perfil__nombre">${esc(v.nombre_llano || v.nombre)}</span>
          <span class="perfil__pista"><span class="perfil__relleno" style="width:${Math.max(2, Math.round(v.valor * 100))}%"></span></span>
          <span class="perfil__valor">${porcentaje(v.valor)}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  function cajaPrecio(precio, titulo = "Precio de referencia") {
    if (!precio)
      return `<div class="aviso">No hay precio de referencia disponible para esta línea comercial.</div>`;
    return `<div class="precio-caja">
      <p class="precio-caja__etiqueta">${esc(titulo)}</p>
      <p class="precio-caja__rango">${esc(precio.texto.replace(" MXN", ""))} <span style="font-size:.7em;color:var(--tinta-media)">MXN</span></p>
      <p class="precio-caja__detalle">Precio de referencia para el cálculo del ahorro: ${pesos(precio.referencia)}. Origen del dato: ${esc(precio.nivel_evidencia)}.</p>
    </div>`;
  }

  async function vistaProducto(id) {
    pintar(cargando());
    const meta = await asegurarMeta();
    const p = await api("/producto/" + id);

    const filtrosAlternativas = { etico: false, vegano: false, formatos: [] };

    const variantes = p.variantes.filter((v) => v.tono || v.calificador_presentacion);
    const ingredientes = p.ingredientes
      .map((i) => {
        const clase = i.poco_comun
          ? "ingrediente--raro"
          : ["superstar", "goodie"].includes(i.calificacion)
          ? "ingrediente--destacado"
          : "";
        return `<span class="ingrediente ${clase}" title="Aparece en ${i.formulas_del_catalogo} fórmulas del catálogo">
          <span class="ingrediente__rango">${i.rango_base}</span>${esc(i.nombre)}</span>`;
      })
      .join("");

    const valorAcabado = p.acabado_declarado
      ? `<p class="atributo__valor">${esc(p.acabado)}</p>`
      : `<p class="atributo__valor atributo__valor--suave">La marca no lo declara</p>`;
    const valorEfectos = p.efectos.length
      ? `<p class="atributo__valor">${esc(p.efectos.join(", "))}</p>`
      : `<p class="atributo__valor atributo__valor--suave">La marca no los declara</p>`;

    const seccionSimilares = p.consultable
      ? `<section class="bloque" id="seccion-similares">
           <div class="bloque__encabezado">
             <h2>Alternativas económicas que se parecen por dentro</h2>
             <p class="bloque__nota">Ordenadas por parecido de fórmula, con su precio y el ahorro frente a este producto.</p>
           </div>
           <div class="fichas" style="margin-bottom:18px">
             <button class="ficha" type="button" data-alt="etico" aria-pressed="false">Solo libres de crueldad animal</button>
             <button class="ficha" type="button" data-alt="vegano" aria-pressed="false">Solo veganas por fórmula</button>
             <button class="ficha" type="button" data-alt="formato" aria-pressed="false">Mismo tipo de labial</button>
           </div>
           <div id="alternativas">${cargando()}</div>
         </section>`
      : `<section class="bloque">
           <div class="aviso">
             <strong>Este producto es de gama económica.</strong> Same Same busca alternativas accesibles para productos de gama alta, así que este aparece como alternativa y no como punto de partida. Puedes compararlo contra un producto de gama alta concreto.
           </div>
           <a class="boton" href="#/comparar?dupe=${esc(p.id_formula)}">Compararlo con un producto de gama alta</a>
         </section>`;

    pintar(`
      <a class="volver" href="#/explorar">&larr; Volver al catálogo</a>

      <div class="ficha-producto">
        <div>${huella(p, 230)}</div>
        <div>
          <p class="ficha-producto__marca">${esc(p.marca)}</p>
          <h1 class="ficha-producto__titulo">${esc(p.nombre)}</h1>
          ${p.tono ? `<p class="bloque__nota">Tono capturado: ${esc(p.tono)}</p>` : ""}
          <div class="tarjeta__pie" style="margin-top:12px">
            ${distintivoGama(p.gama)}
            ${distintivoEtico(p)}
            ${distintivoVegano(p)}
          </div>

          ${cajaPrecio(p.precio)}

          <div class="atributos">
            <div class="atributo"><p class="atributo__nombre">Tipo de labial</p><p class="atributo__valor">${esc(nombreFormato(p))}</p></div>
            <div class="atributo"><p class="atributo__nombre">Acabado</p>${valorAcabado}</div>
            <div class="atributo"><p class="atributo__nombre">Ingredientes declarados</p><p class="atributo__valor">${p.n_ingredientes_base}</p></div>
            <div class="atributo"><p class="atributo__nombre">Efecto que promete</p>${valorEfectos}</div>
          </div>

          <div class="aviso">
            <strong>Tipo de fórmula:</strong> ${esc(p.tipo_formula)}. Es una descripción del catálogo obtenida al agrupar las fórmulas parecidas entre sí, no una afirmación sobre la calidad del producto.
          </div>

          ${
            variantes.length
              ? `<p class="bloque__nota"><strong>${variantes.length}</strong> ${variantes.length === 1 ? "variante capturada" : "variantes capturadas"} de este producto: ${variantes.map((v) => esc(v.tono || v.calificador_presentacion)).join(", ")}.</p>`
              : ""
          }

          <p style="margin-top:16px"><a class="boton boton--secundario" href="${esc(p.url_representante)}" target="_blank" rel="noopener noreferrer">Ver la lista de ingredientes de origen</a></p>
        </div>
      </div>

      ${
        p.perfil_textura && p.perfil_textura.length
          ? `<section class="bloque">
              <div class="bloque__encabezado">
                <h2>Cómo está construida esta fórmula</h2>
                <p class="bloque__nota">Posición de este producto frente al resto del catálogo, no cantidad de ingrediente.</p>
              </div>
              ${barrasPerfil(p.perfil_textura)}
              <details class="detalle-tecnico">
                <summary>Ver detalle técnico del perfil funcional</summary>
                <div class="detalle-tecnico__cuerpo">
                  <p class="bloque__nota">Las ocho variables con mayor valor escalado entre las ${meta.modelo.variables_perfil} del perfil funcional. Cada variable es una proporción del vehículo o una posición de declaración, escalada al rango del catálogo con una transformación de mínimo y máximo.</p>
                  <div class="tabla-envoltura"><table class="tabla">
                    <thead><tr><th>Variable</th><th>Nombre técnico</th><th class="numero">Valor escalado</th></tr></thead>
                    <tbody>${p.perfil_destacado
                      .map(
                        (v) =>
                          `<tr><td>${esc(v.variable)}</td><td>${esc(v.nombre)}</td><td class="numero">${v.valor.toFixed(4)}</td></tr>`
                      )
                      .join("")}</tbody>
                  </table></div>
                </div>
              </details>
            </section>`
          : ""
      }

      <section class="bloque">
        <div class="bloque__encabezado">
          <h2>Los ingredientes que comparamos</h2>
          <p class="bloque__nota">${p.ingredientes.length} de los ${p.n_ingredientes_base} declarados, con su posición en la etiqueta.</p>
        </div>
        <p class="bloque__nota" style="max-width:74ch;margin-bottom:14px">La etiqueta declara los ingredientes en orden de concentración. Same Same retiene los que ocupan las primeras ${meta.modelo.rango_maximo} posiciones y que aparecen en suficientes productos del catálogo, porque un ingrediente presente en un solo labial no permite comparar nada. Por eso la numeración salta posiciones. En verde los mejor valorados por la fuente, en rosa los poco frecuentes en el catálogo.</p>
        <div class="lista-ingredientes">${ingredientes}</div>
      </section>

      ${seccionSimilares}
    `);

    if (!p.consultable) return;

    async function cargarAlternativas() {
      const caja = document.getElementById("alternativas");
      if (!caja) return;
      caja.innerHTML = cargando();
      try {
        const datos = await api("/alternativas/" + p.id_formula, {
          etico: filtrosAlternativas.etico,
          vegano: filtrosAlternativas.vegano,
          formato: filtrosAlternativas.formatos,
          n: 6
        });

        const avisoUniverso = !datos.universo.suficiente
          ? `<div class="aviso"><strong>Quedan pocas alternativas.</strong> Los filtros dejan ${datos.universo.tras_filtros} de ${datos.universo.completo} opciones. Con menos de ${datos.universo.minimo_recomendado} la comparación pierde sentido, porque casi cualquier producto parecería estar entre los primeros lugares.</div>`
          : "";
        const avisoVegano = datos.aviso_vegano ? `<div class="aviso">${esc(llano(datos.aviso_vegano))}</div>` : "";

        caja.innerHTML = `
          ${avisoUniverso}${avisoVegano}
          <p class="bloque__nota" style="margin-bottom:16px">Se revisan ${datos.universo.tras_filtros} alternativas de gama económica. El veredicto de cada una se calcula siempre contra las ${datos.universo.completo} fórmulas económicas del catálogo, de modo que no cambia cuando activas un filtro.</p>
          ${datos.resultados.map((r, i) => tarjetaAlternativa(r, i + 1, p.id_formula)).join("")}
          <div class="aviso" style="margin-top:18px">${esc(llano(datos.aviso_alcance))}</div>`;
      } catch (e) {
        caja.innerHTML = `<div class="vacio"><p>${esc(e.message)}</p></div>`;
      }
    }

    document.querySelectorAll("[data-alt]").forEach((boton) =>
      boton.addEventListener("click", () => {
        const clave = boton.dataset.alt;
        if (clave === "formato") {
          filtrosAlternativas.formatos = filtrosAlternativas.formatos.length ? [] : [p.formato];
          boton.setAttribute("aria-pressed", String(filtrosAlternativas.formatos.length > 0));
        } else {
          filtrosAlternativas[clave] = !filtrosAlternativas[clave];
          boton.setAttribute("aria-pressed", String(filtrosAlternativas[clave]));
        }
        cargarAlternativas();
      })
    );
    cargarAlternativas();
  }

  function tarjetaAlternativa(r, orden, idLujo) {
    return `<article class="resultado resultado--n${r.nivel}">
      <div class="resultado__fila">
        <span class="resultado__orden">${orden}</span>
        <div class="resultado__cuerpo">
          <span class="tarjeta__marca">${esc(r.marca)}</span>
          <h3 style="margin:.15em 0 .4em">${esc(r.nombre)}</h3>
          <div class="tarjeta__pie" style="margin-bottom:6px">
            ${distintivoNivel(r.nivel)}
            <span class="distintivo distintivo--neutro">${esc(nombreFormato(r))}</span>
            ${r.es_libre_crueldad ? '<span class="distintivo distintivo--etico">Libre de crueldad animal</span>' : ""}
            ${r.aptitud_vegana === "vegana por fórmula" ? '<span class="distintivo distintivo--vegano">Vegana por fórmula</span>' : ""}
          </div>
          <div class="resultado__precio">
            ${r.precio ? `<span class="precio-tarjeta"><span class="precio-tarjeta__rango">${esc(r.precio.texto.replace(" MXN", ""))}</span><span class="precio-tarjeta__nota">MXN</span></span>` : ""}
            ${distintivoAhorro(r.ahorro)}
          </div>
          <p class="bloque__nota">${esc(llano(r.descripcion))}</p>
          <p class="resultado__acciones">
            <a class="boton boton--chico" href="#/comparar?lujo=${esc(idLujo)}&dupe=${esc(r.id_formula)}">Comparar a fondo</a>
            <a class="boton boton--secundario boton--chico" href="#/producto/${esc(r.id_formula)}">Ver su fórmula</a>
          </p>
          <details class="detalle-tecnico">
            <summary>Ver detalle técnico</summary>
            <div class="detalle-tecnico__cuerpo">
              <div class="resultado__medidas" style="margin-top:0;border-top:0;padding-top:0">
                <div><span class="medida__valor">${r.similitud.toFixed(4)}</span><span class="medida__nombre">similitud híbrida</span></div>
                <div><span class="medida__valor">${r.percentil.toFixed(1)}</span><span class="medida__nombre">percentil en la consulta</span></div>
                <div><span class="medida__valor">${r.separacion.toFixed(2)}</span><span class="medida__nombre">separación robusta</span></div>
                <div><span class="medida__valor">${r.posicion}</span><span class="medida__nombre">posición de ${r.universo}</span></div>
              </div>
              <p class="bloque__nota" style="margin-top:12px">Etiqueta formal del sistema: ${esc(r.etiqueta)}. Familia de formulación: ${esc(r.nombre_arquetipo)}.</p>
            </div>
          </details>
        </div>
      </div>
    </article>`;
  }

  // --------------------------------------------------------------------
  // Comparar
  // --------------------------------------------------------------------
  async function vistaComparar(parametros) {
    pintar(cargando());
    await asegurarMeta();
    const [alta, economica] = await Promise.all([
      api("/lineas", { gama: "alta", por_pagina: 600 }),
      api("/lineas", { gama: "economica", por_pagina: 600 })
    ]);

    const opciones = (lista, seleccion) =>
      lista.resultados
        .map((l) => {
          const precio = l.precio ? " · " + pesos(l.precio.referencia) : "";
          return `<option value="${esc(l.id_representante)}"${l.id_representante === seleccion ? " selected" : ""}>${esc(l.marca)} · ${esc(l.nombre)}${esc(precio)}</option>`;
        })
        .join("");

    pintar(`
      <div class="bloque__encabezado">
        <div>
          <h1>Comparar dos labiales</h1>
          <p class="bloque__nota" style="max-width:64ch">Elige el labial de gama alta que te gusta y la opción económica que dicen que es igual. Same Same te dice si de verdad se parecen por dentro, en qué se parecen, en qué se diferencian y cuánto te ahorras.</p>
        </div>
      </div>

      <div class="panel" style="margin-bottom:28px">
        <div class="comparador">
          <div>
            <label class="etiqueta-campo" for="sel-lujo">El de gama alta</label>
            <select id="sel-lujo">${opciones(alta, parametros.lujo)}</select>
          </div>
          <p class="comparador__contra">contra</p>
          <div>
            <label class="etiqueta-campo" for="sel-dupe">La opción económica</label>
            <select id="sel-dupe">${opciones(economica, parametros.dupe)}</select>
          </div>
        </div>
        <p style="margin:20px 0 0"><button class="boton" id="boton-validar">Comparar</button></p>
      </div>

      <div id="resultado-validacion"></div>
    `);

    document.getElementById("boton-validar").addEventListener("click", ejecutarComparacion);
    if (parametros.lujo && parametros.dupe) ejecutarComparacion();
  }

  const capitalizar = (texto) =>
    String(texto ?? "").charAt(0).toUpperCase() + String(texto ?? "").slice(1);

  function listaCara(registro) {
    const filas = [
      ["Precio de referencia", registro.precio ? pesos(registro.precio.referencia) + " MXN" : "Sin dato"],
      ["Rango habitual", registro.precio ? registro.precio.texto.replace(" MXN", "") : "Sin dato"],
      ["Tipo de labial", nombreFormato(registro)],
      ["Acabado", registro.acabado_declarado ? capitalizar(registro.acabado) : "No lo declara"],
      [
        "Efecto que promete",
        registro.efectos && registro.efectos.length ? capitalizar(registro.efectos.join(", ")) : "No lo declara"
      ],
      ["Ingredientes declarados", String(registro.n_ingredientes_base)],
      ["Vegana", registro.es_vegana ? "Sí, por fórmula" : capitalizar(registro.aptitud_vegana)],
      [
        "Crueldad animal",
        registro.es_libre_crueldad ? "Marca libre de crueldad" : capitalizar(registro.clasificacion_etica)
      ]
    ];
    return `<ul class="cara__lista">${filas
      .map(
        ([clave, valor]) =>
          `<li><span class="cara__clave">${esc(clave)}</span><span class="cara__valor">${esc(valor)}</span></li>`
      )
      .join("")}</ul>`;
  }

  function chipsIngredientes(lista, vacio, total) {
    if (!lista.length) return `<p class="bloque__nota">${esc(vacio)}</p>`;
    const restantes = (total ?? lista.length) - lista.length;
    const resto =
      restantes > 0
        ? `<span class="ingrediente" style="background:transparent;border:1px dashed var(--arena)">y ${restantes} más</span>`
        : "";
    return `<div class="lista-ingredientes">${lista
      .map((i) => {
        const clase = i.poco_comun ? "ingrediente--raro" : "";
        const rango = i.rango_lujo ?? i.rango_dupe;
        return `<span class="ingrediente ${clase}" title="Aparece en ${i.formulas_del_catalogo} fórmulas del catálogo">
          <span class="ingrediente__rango">${rango ?? ""}</span>${esc(i.ingrediente)}</span>`;
      })
      .join("")}${resto}</div>`;
  }

  async function ejecutarComparacion() {
    const caja = document.getElementById("resultado-validacion");
    const lujo = document.getElementById("sel-lujo").value;
    const dupe = document.getElementById("sel-dupe").value;
    caja.innerHTML = cargando();
    history.replaceState(null, "", `#/comparar?lujo=${lujo}&dupe=${dupe}`);
    try {
      const v = await api("/validar", { lujo, dupe });
      const x = v.explicacion;
      const a = v.ahorro;

      const precioHero = `<div class="precio-hero">
        <div class="precio-hero__lado">
          <p class="precio-hero__marca">${esc(v.lujo.marca)}</p>
          <p class="precio-hero__cifra">${v.lujo.precio ? pesos(v.lujo.precio.referencia) : "Sin dato"}</p>
          <p class="precio-hero__rango">${v.lujo.precio ? esc(v.lujo.precio.texto.replace(" MXN", "")) : ""}</p>
        </div>
        <div class="precio-hero__centro">
          ${
            a
              ? `<p class="precio-hero__ahorro ${a.favorable ? "" : "precio-hero__ahorro--adverso"}">${a.favorable ? pesos(a.pesos) : pesos(Math.abs(a.pesos))}</p>
                 <p class="precio-hero__leyenda">${a.favorable ? "de ahorro, " + porcentaje(a.proporcion) + " menos" : "más caro que el de gama alta"}</p>`
              : '<p class="precio-hero__leyenda">Sin precio comparable</p>'
          }
        </div>
        <div class="precio-hero__lado">
          <p class="precio-hero__marca">${esc(v.dupe.marca)}</p>
          <p class="precio-hero__cifra">${v.dupe.precio ? pesos(v.dupe.precio.referencia) : "Sin dato"}</p>
          <p class="precio-hero__rango">${v.dupe.precio ? esc(v.dupe.precio.texto.replace(" MXN", "")) : ""}</p>
        </div>
      </div>`;

      caja.innerHTML = `
        <div class="veredicto veredicto--n${v.nivel}">
          <p class="veredicto__etiqueta">${esc(NIVEL_LLANO[v.nivel])}</p>
          <p>${esc(llano(v.veredicto))}</p>
        </div>

        ${precioHero}
        ${
          a && a.estimado
            ? '<div class="aviso">Al menos uno de los dos precios es una estimación y no un precio observado en tienda. El ahorro es orientativo.</div>'
            : ""
        }

        <div class="caras">
          <div class="cara cara--alta">
            <p class="tarjeta__marca">${esc(v.lujo.marca)}</p>
            <h3>${esc(v.lujo.nombre)}</h3>
            <p class="bloque__nota">${esc(v.lujo.tipo_formula)}</p>
            ${listaCara(v.lujo)}
          </div>
          <div class="cara cara--economica">
            <p class="tarjeta__marca">${esc(v.dupe.marca)}</p>
            <h3>${esc(v.dupe.nombre)}</h3>
            <p class="bloque__nota">${esc(v.dupe.tipo_formula)}</p>
            ${listaCara(v.dupe)}
          </div>
        </div>

        <section class="bloque">
          <div class="bloque__encabezado"><h2>En qué se parecen</h2></div>
          <p>${esc(llano(x.resumen))}</p>
          ${chipsIngredientes(x.ingredientes_compartidos, "No comparten ningún ingrediente de los que el sistema compara.", x.n_ingredientes_compartidos)}
        </section>

        <section class="bloque">
          <div class="bloque__encabezado"><h2>En qué se diferencian</h2></div>
          <p>${esc(llano(x.resumen_diferencias))}</p>
          <div class="segmentos">
            <div>
              <p class="segmento__titulo">Solo en ${esc(v.lujo.marca)}, ${x.n_solo_lujo} ingredientes</p>
              ${chipsIngredientes(x.solo_en_lujo, "Ninguno.", x.n_solo_lujo)}
            </div>
            <div>
              <p class="segmento__titulo">Solo en ${esc(v.dupe.marca)}, ${x.n_solo_dupe} ingredientes</p>
              ${chipsIngredientes(x.solo_en_dupe, "Ninguno.", x.n_solo_dupe)}
            </div>
          </div>
          <details class="detalle-tecnico">
            <summary>Ver detalle técnico de la comparación</summary>
            <div class="detalle-tecnico__cuerpo">
              <div class="resultado__medidas" style="margin-top:0;border-top:0;padding-top:0">
                <div><span class="medida__valor">${v.similitud.toFixed(4)}</span><span class="medida__nombre">similitud híbrida</span></div>
                <div><span class="medida__valor">${v.percentil.toFixed(1)}</span><span class="medida__nombre">percentil en la consulta</span></div>
                <div><span class="medida__valor">${v.separacion.toFixed(2)}</span><span class="medida__nombre">separación robusta</span></div>
                <div><span class="medida__valor">${v.posicion}</span><span class="medida__nombre">posición de ${v.universo}</span></div>
                <div><span class="medida__valor">${porcentaje(x.aporte_relativo_ingredientes)}</span><span class="medida__nombre">aporte de los ingredientes</span></div>
                <div><span class="medida__valor">${porcentaje(x.aporte_relativo_perfil)}</span><span class="medida__nombre">aporte del perfil funcional</span></div>
              </div>
              <p class="bloque__nota" style="margin:14px 0 8px">Etiqueta formal del sistema: ${esc(v.etiqueta)}.</p>
              <p class="bloque__nota" style="margin:14px 0 8px">Ingredientes compartidos dentro del corte de rango, con su posición de declaración en cada fórmula.</p>
              <div class="tabla-envoltura"><table class="tabla">
                <thead><tr><th>Ingrediente</th><th class="numero">Posición en ${esc(v.lujo.marca)}</th><th class="numero">Posición en ${esc(v.dupe.marca)}</th><th class="numero">Fórmulas del catálogo</th></tr></thead>
                <tbody>${x.ingredientes_compartidos_total
                  .map(
                    (i) =>
                      `<tr><td>${esc(i.ingrediente)}${i.poco_comun ? ' <span class="distintivo distintivo--gris-etico">poco común</span>' : ""}</td>
                       <td class="numero">${i.rango_lujo}</td><td class="numero">${i.rango_dupe}</td><td class="numero">${i.formulas_del_catalogo}</td></tr>`
                  )
                  .join("")}</tbody>
              </table></div>
              <p class="bloque__nota" style="margin:18px 0 8px">Variables del perfil funcional con mayor aporte al puntaje y variables con mayor brecha entre las dos fórmulas.</p>
              <div class="tabla-envoltura"><table class="tabla">
                <thead><tr><th>Variable</th><th class="numero">${esc(v.lujo.marca)}</th><th class="numero">${esc(v.dupe.marca)}</th><th class="numero">Aporte</th><th class="numero">Brecha</th></tr></thead>
                <tbody>${x.perfil_funcional
                  .concat(x.contrastes_funcionales.filter((c) => !x.perfil_funcional.some((f) => f.variable === c.variable)))
                  .map(
                    (r) =>
                      `<tr><td>${esc(r.nombre)}</td><td class="numero">${r.valor_lujo.toFixed(3)}</td><td class="numero">${r.valor_dupe.toFixed(3)}</td><td class="numero">${r.aporte.toFixed(3)}</td><td class="numero">${r.brecha.toFixed(3)}</td></tr>`
                  )
                  .join("")}</tbody>
              </table></div>
            </div>
          </details>
        </section>

        <section class="bloque">
          <div class="bloque__encabezado">
            <h2>Si buscas algo más parecido</h2>
            <p class="bloque__nota">Las ${v.mejores_del_catalogo.length} fórmulas económicas más cercanas a ${esc(v.lujo.nombre)}, sin filtros.</p>
          </div>
          <div class="lista-compacta">
            ${v.mejores_del_catalogo
              .map(
                (r, i) => `<div class="compacta__fila">
                  <span class="compacta__orden">${i + 1}</span>
                  <span>
                    <span class="compacta__marca">${esc(r.marca)}</span><br>
                    <span class="compacta__nombre">${esc(r.nombre)}</span>
                    <span style="margin-left:6px">${distintivoNivel(r.nivel)}</span>
                  </span>
                  <span class="compacta__precio">${r.precio ? pesos(r.precio.referencia) : ""}${r.ahorro && r.ahorro.favorable ? " · " + porcentaje(r.ahorro.proporcion) + " menos" : ""}</span>
                  <span class="compacta__accion"><a href="#/comparar?lujo=${esc(v.lujo.id_formula)}&dupe=${esc(r.id_formula)}">Comparar</a></span>
                </div>`
              )
              .join("")}
          </div>
        </section>

        <div class="aviso">${esc(llano(v.aviso_alcance))}</div>`;
      caja.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      caja.innerHTML = `<div class="vacio"><h3>No fue posible comparar ese par</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  // --------------------------------------------------------------------
  // Marcas
  // --------------------------------------------------------------------
  async function vistaMarcas() {
    pintar(cargando());
    const marcas = await asegurarMarcas();

    const tarjeta = (m) => `<article class="tarjeta">
      <span class="tarjeta__nombre" style="font-size:1.3rem">${esc(m.marca)}</span>
      <span class="tarjeta__marca">${m.lineas} productos · ${m.formulas} fórmulas</span>
      ${
        m.precio_mediano
          ? `<span class="precio-tarjeta"><span class="precio-tarjeta__rango">${pesos(m.precio_mediano)}</span><span class="precio-tarjeta__nota">precio típico, de ${pesos(m.precio_minimo)} a ${pesos(m.precio_maximo)}</span></span>`
          : ""
      }
      <div class="tarjeta__pie" style="margin-top:6px">
        ${distintivoGama(m.gama)}
        ${distintivoEtico(m)}
      </div>
      <p class="bloque__nota" style="margin:8px 0 0">
        ${porcentaje(m.proporcion_vegana)} de sus fórmulas son veganas por composición.<br>
        Tipos: ${m.nombres_formato.map((f) => esc(f)).join(", ")}.
      </p>
      <p style="margin:12px 0 0"><a class="boton boton--secundario boton--chico" href="#/explorar?marca=${encodeURIComponent(m.marca)}">Ver sus productos</a></p>
    </article>`;

    pintar(`
      <div class="bloque__encabezado">
        <div>
          <h1>Explora las marcas</h1>
          <p class="bloque__nota" style="max-width:62ch">Las ${marcas.length} marcas del catálogo, con su gama, su precio típico en pesos, su clasificación de crueldad animal y la proporción de fórmulas veganas por composición.</p>
        </div>
      </div>

      <div class="aviso">
        <strong>Cómo se clasifica la crueldad animal.</strong> La bandera se construye contrastando dos fuentes públicas, PETA y Cruelty-Free Kitty. Una marca queda como libre de crueldad animal solo cuando ambas coinciden, y queda marcada como evidencia contradictoria cuando las fuentes discrepan de forma real. La aptitud vegana, en cambio, se deriva de la propia lista de ingredientes de cada fórmula y no de la política declarada por la marca.
      </div>

      <section class="bloque">
        <h2>Gama alta</h2>
        <div class="rejilla rejilla--marcas">${marcas.filter((m) => m.gama === "alta").map(tarjeta).join("")}</div>
      </section>
      <section class="bloque">
        <h2>Gama económica</h2>
        <div class="rejilla rejilla--marcas">${marcas.filter((m) => m.gama === "economica").map(tarjeta).join("")}</div>
      </section>
    `);
  }

  // --------------------------------------------------------------------
  // Cómo funciona
  // --------------------------------------------------------------------
  async function vistaComoFunciona() {
    pintar(cargando());
    const meta = await asegurarMeta();
    const e = meta.escala;
    const d = meta.desempeno;
    const pr = meta.precios;

    const filasCobertura = pr.niveles_evidencia
      .map(
        (nivel) =>
          `<tr><td>${esc(nivel)}</td><td class="numero">${pr.cobertura[nivel] || 0}</td></tr>`
      )
      .join("");

    pintar(`
      <div class="prosa">
        <h1>Cómo funciona</h1>
        <p class="portada__bajada">Same Same responde una sola pregunta, y la responde con evidencia verificable: si la fórmula de una alternativa económica sostiene la equivalencia que se le atribuye frente a un producto de gama alta. A esa respuesta le añade el precio, porque sin ahorro la equivalencia no es accionable.</p>

        <h2>Qué compara el sistema</h2>
        <p>Cada producto se representa por dos vectores construidos a partir de su lista de ingredientes. El primero recoge los ${meta.modelo.rango_maximo} primeros ingredientes de su base química, es decir el vehículo de la fórmula sin los colorantes. El segundo recoge ${meta.modelo.variables_perfil} variables funcionales derivadas de esa misma lista, entre ellas la carga emoliente, el control de viscosidad, el sistema conservador y la proporción de ingredientes con calificación editorial favorable.</p>
        <p>La similitud entre dos productos es una combinación convexa de la similitud coseno sobre ambas representaciones, con un peso de ${(meta.modelo.alfa_ingredientes * 100).toFixed(0)}% para los ingredientes y ${((1 - meta.modelo.alfa_ingredientes) * 100).toFixed(0)}% para el perfil funcional. Ese peso no se eligió por criterio estético: se seleccionó por validación dejando un ancla fuera sobre las equivalencias documentadas por la comunidad.</p>

        <h2>Por qué no verás un porcentaje de parecido</h2>
        <p>El valor absoluto del coseno no es comparable entre consultas. Una similitud de 0.55 puede ser excepcional para un producto cuyo conjunto de alternativas es plano y perfectamente mediocre para otro cuyo catálogo ofrece decenas de fórmulas más parecidas. Decir "87% similar" sería, por lo tanto, una cifra que significa cosas distintas en cada pantalla.</p>
        <p>En su lugar el sistema sitúa a cada candidata dentro del conjunto de alternativas de su propia consulta con dos magnitudes complementarias. El <strong>percentil</strong> indica qué porción del catálogo económico queda por debajo de esa candidata. La <strong>separación robusta</strong> mide cuánto sobresale respecto de la distribución completa de esa consulta, en unidades de desviación absoluta mediana, que es una medida resistente a valores extremos. Ambas aparecen en la interfaz dentro de cada apartado de detalle técnico, para que el resultado principal se lea sin vocabulario especializado.</p>
        <p>Los empates importan: muchas candidatas comparten exactamente el mismo vehículo y por lo tanto la misma similitud. El rango se calcula con rango promedio y con una tolerancia de ${meta.modelo.tolerancia_empate.toExponential(0)}, de modo que el ruido de la aritmética de coma flotante no altera el orden ni la etiqueta.</p>

        <h2>La escala de tres niveles</h2>
        <div class="escala-visual">
          <div class="escala-fila">
            <span class="escala-fila__marca" style="background:#6FA97C"></span>
            <div><h4>${esc(NIVEL_LLANO[1])}</h4><p>${esc(llano(meta.etiquetas["1"].descripcion))} Etiqueta formal: ${esc(meta.etiquetas["1"].etiqueta)}. Exige percentil de al menos ${e.percentil_nivel_1} y separación de al menos ${e.separacion_nivel_1.toFixed(2)}.</p></div>
          </div>
          <div class="escala-fila">
            <span class="escala-fila__marca" style="background:#E0A26A"></span>
            <div><h4>${esc(NIVEL_LLANO[2])}</h4><p>${esc(llano(meta.etiquetas["2"].descripcion))} Etiqueta formal: ${esc(meta.etiquetas["2"].etiqueta)}. Exige percentil de al menos ${e.percentil_nivel_2.toFixed(2)}.</p></div>
          </div>
          <div class="escala-fila">
            <span class="escala-fila__marca" style="background:#E2849F"></span>
            <div><h4>${esc(NIVEL_LLANO[3])}</h4><p>${esc(llano(meta.etiquetas["3"].descripcion))} Etiqueta formal: ${esc(meta.etiquetas["3"].etiqueta)}.</p></div>
          </div>
        </div>
        <p>Los dos umbrales se derivan de los datos y no se fijan por conveniencia. El umbral de separación del nivel más alto es el percentil diez de la separación que alcanza el primer candidato a lo largo de las consultas del catálogo, de modo que el nivel más alto se niega precisamente a las consultas cuyo conjunto de alternativas es plano. El umbral de percentil del nivel intermedio es la mediana del percentil que alcanzan las equivalencias documentadas por la comunidad.</p>
        <p>El veredicto se calcula siempre contra el conjunto completo de ${meta.catalogo.formulas_economica} fórmulas accesibles. Activar un filtro ético o vegano cambia qué alternativas se muestran, nunca el juicio sobre cada una de ellas.</p>

        <h2>De dónde sale el precio</h2>
        <p>Las listas de ingredientes no contienen precios y ningún minorista mexicano publica el surtido completo de las ${meta.catalogo.marcas} marcas del catálogo. Los precios se levantaron a mano en una sola fecha, el ${esc(pr.fecha_consulta)}, en minoristas con operación en México, y las líneas no observadas se completan con una jerarquía de estimación que siempre usa la información más cercana disponible: primero la propia línea comercial, después la misma marca en el mismo tipo de labial y, en último lugar, un modelo log lineal que combina el efecto de la marca y el del formato. Es una imputación multivariada y no una media global, porque el precio de un labial depende conjuntamente de quién lo fabrica y de qué tipo de producto es.</p>
        <p>Las marcas con poca presencia en minoristas mexicanos se convierten desde su precio oficial en Estados Unidos al tipo de cambio de ${pr.tipo_cambio_usd_mxn} pesos por dólar. Cada línea declara de forma explícita qué tan directo es el dato que sostiene su precio.</p>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Origen del precio</th><th class="numero">Líneas comerciales</th></tr></thead>
          <tbody>${filasCobertura}<tr><td><strong>Total</strong></td><td class="numero"><strong>${pr.lineas_con_precio}</strong></td></tr></tbody>
        </table></div>
        <p>El rango que muestra la interfaz va del precio más bajo accesible de forma habitual, con la promoción típica de su gama, al precio regular más alto observado. El precio de referencia, que es el que se usa para calcular el ahorro, es el promedio de los precios regulares de su fuente.</p>

        <h2>Qué tan bien funciona</h2>
        <p>El sistema se evalúa contra las equivalencias que la comunidad documenta, tratadas como verdad de referencia. La medición honesta se hace sobre anclas dejadas fuera de la selección de hiperparámetros, que es la única que sostiene cualquier conclusión.</p>
        <div class="pilares">
          <div class="pilar"><p class="pilar__titulo">${d["HitRate@5"].toFixed(3)}</p><p>Hit Rate en las cinco primeras posiciones</p></div>
          <div class="pilar"><p class="pilar__titulo">${d.MRR_macro.toFixed(3)}</p><p>MRR macro sobre anclas dejadas fuera</p></div>
          <div class="pilar"><p class="pilar__titulo">${meta.catalogo.formulas}</p><p>fórmulas con lista de ingredientes extraída y verificada</p></div>
        </div>
        <p>Estas cifras se reportan tal como son. Un Hit Rate de ${d["HitRate@5"].toFixed(2)} significa que el producto exacto que la comunidad señala aparece entre las cinco primeras posiciones en uno de cada cuatro casos. El sistema no pretende adivinar cuál alternativa se volvió viral: pretende decir si la fórmula sostiene la afirmación, que es una pregunta distinta y verificable.</p>

        <div id="documentados">${cargando()}</div>

        <h2>Qué no medimos</h2>
        <ul>
          <li><strong>Tono y color.</strong> La unidad de análisis es la fórmula sin colorantes. Dos fórmulas equivalentes pueden verse completamente distintas en el labio.</li>
          <li><strong>Desempeño en uso.</strong> Duración, comodidad, transferencia y pigmentación dependen de la concentración de cada ingrediente, que la regulación no obliga a declarar.</li>
          <li><strong>Precio por contenido.</strong> El precio no se normaliza por gramo o mililitro, porque las presentaciones no se registraron de forma sistemática, y corresponde a una sola fecha de consulta.</li>
          <li><strong>Calidad.</strong> Un veredicto negativo no dice que el producto sea malo. Dice que su fórmula no sostiene la comparación que se le atribuye.</li>
        </ul>

        <h2>De dónde salen los datos</h2>
        <ul>
          <li><strong>Listas de ingredientes.</strong> Repositorio INKEEDecoder, consultado de forma estructurada y a bajo volumen tras verificar que su archivo de exclusión para robots lo permite.</li>
          <li><strong>Precios.</strong> Consulta manual en minoristas con operación en México, en una sola fecha, más los precios de lista oficiales de las marcas con poca distribución local.</li>
          <li><strong>Crueldad animal.</strong> Contraste manual entre PETA y Cruelty-Free Kitty, con una categoría explícita para los casos en que ambas fuentes discrepan.</li>
          <li><strong>Equivalencias de referencia.</strong> Pares documentados en comunidades de Reddit, TikTok y Pinterest, enlazados al catálogo con coincidencia difusa y revisión manual de los casos ambiguos.</li>
        </ul>
      </div>
    `);

    cargarDocumentados();
  }

  async function cargarDocumentados() {
    const caja = document.getElementById("documentados");
    if (!caja) return;
    try {
      const d = await api("/pares-documentados");
      caja.innerHTML = `
        <h2>El conjunto de referencia, par por par</h2>
        <p>Las ${d.total} equivalencias que se recogieron de comunidades de Reddit, TikTok y Pinterest son la evidencia externa contra la que se calibró la escala. Esta tabla muestra el veredicto que el sistema asigna a cada una, y es el resultado que sostiene el hallazgo central del proyecto.</p>
        <div class="pilares" style="margin-top:18px">
          <div class="pilar" style="background:var(--salvia-suave)"><p class="pilar__titulo">${d.resumen.confirmados}</p><p>se parecen por dentro</p></div>
          <div class="pilar" style="background:#FFF3EA"><p class="pilar__titulo">${d.resumen.parciales}</p><p>se parecen a medias</p></div>
          <div class="pilar" style="background:var(--rosa-suave)"><p class="pilar__titulo">${d.resumen.advertencias}</p><p>no se parecen por dentro</p></div>
        </div>
        <p>De los ${d.total} pares que la comunidad documenta como equivalentes, la mitad no resiste la comprobación sobre la fórmula.${
          d.ahorro_proporcional_mediano
            ? ` El ahorro mediano de estos pares es de ${porcentaje(d.ahorro_proporcional_mediano)} sobre el precio de gama alta, y es parecido en los tres niveles: el precio explica por qué se buscan sustitutos, la fórmula es lo que distingue uno bien fundado de uno que solo se parece en el color.`
            : ""
        }</p>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Producto de gama alta</th><th>Alternativa propuesta</th><th>Origen</th><th class="numero">Ahorro</th><th>Veredicto</th></tr></thead>
          <tbody>${d.resultados
            .map(
              (p) => `<tr>
                <td><a href="#/producto/${esc(p.lujo.id_formula)}" style="text-decoration:none"><strong>${esc(p.lujo.marca)}</strong><br><span style="color:var(--tinta-media)">${esc(p.lujo.nombre)}</span></a></td>
                <td><a href="#/producto/${esc(p.dupe.id_formula)}" style="text-decoration:none"><strong>${esc(p.dupe.marca)}</strong><br><span style="color:var(--tinta-media)">${esc(p.dupe.nombre)}</span></a></td>
                <td>${esc(p.origen)}</td>
                <td class="numero">${p.ahorro && p.ahorro.favorable ? porcentaje(p.ahorro.proporcion) : ""}</td>
                <td><a href="#/comparar?lujo=${esc(p.lujo.id_formula)}&dupe=${esc(p.dupe.id_formula)}" class="distintivo nivel-${p.nivel}" style="text-decoration:none"><span class="punto-nivel n${p.nivel}"></span>${esc(NIVEL_LLANO[p.nivel])}</a></td>
              </tr>`
            )
            .join("")}</tbody></table></div>`;
    } catch (e) {
      caja.innerHTML = `<p class="bloque__nota">${esc(e.message)}</p>`;
    }
  }

  // --------------------------------------------------------------------
  // Sobre Same Same
  // --------------------------------------------------------------------
  async function vistaNosotros() {
    const meta = await asegurarMeta();
    pintar(`
      <div class="prosa">
        <h1>Sobre <em>Same Same</em></h1>
        <p class="portada__bajada">Belleza informada, decisiones más conscientes.</p>

        <p>Same Same nace de una pregunta sencilla: ¿realmente necesito comprar el producto más caro?</p>
        <p>Cada temporada, las redes sociales producen decenas de equivalencias virales que afirman que un labial económico es idéntico a uno de gama alta. Esas afirmaciones circulan sin criterio verificable: se apoyan en la impresión de una persona frente a una cámara, en la coincidencia de tono o en la simple repetición. Quien compra no tiene manera de contrastarlas.</p>
        <p>Este proyecto propone un criterio objetivo y auditable. Toma la única evidencia que la regulación cosmética obliga a publicar, la lista de ingredientes en nomenclatura INCI ordenada por concentración decreciente, y la convierte en una comparación reproducible entre fórmulas. Al resultado le suma el precio de referencia en pesos, porque la decisión de compra combina las dos cosas. El resultado no es una opinión: es una posición medida dentro de un catálogo, con un método declarado y una evaluación contra evidencia externa.</p>

        <div class="pilares">
          <div class="pilar"><p class="pilar__titulo">Análisis de formulación</p><p>Comparación sobre la fórmula declarada, no sobre la percepción de color.</p></div>
          <div class="pilar"><p class="pilar__titulo">Ahorro medido</p><p>Precio de referencia en pesos para las ${meta.precios.lineas_con_precio} líneas del catálogo, con su nivel de evidencia declarado.</p></div>
          <div class="pilar"><p class="pilar__titulo">Transparencia</p><p>El sistema declara qué mide, qué no mide y con qué evidencia lo sostiene.</p></div>
          <div class="pilar"><p class="pilar__titulo">Método reproducible</p><p>Cada decisión queda registrada en una bitácora y cada cifra puede recalcularse.</p></div>
        </div>

        <h2>Cómo se construyó</h2>
        <p>El catálogo se levantó mediante extracción estructurada de listas INCI para ${meta.catalogo.marcas} marcas, ${meta.catalogo.formulas_alta} fórmulas de gama alta y ${meta.catalogo.formulas_economica} de gama económica. Las listas se normalizaron, se resolvieron los nombres comerciales para separar el tono del nombre del producto, se derivaron ${meta.modelo.variables_perfil} variables funcionales por fórmula y se construyó un modelo de similitud calibrado contra equivalencias documentadas por la comunidad. Después se levantaron los precios en tiendas y se completaron las líneas no observadas con una jerarquía de estimación.</p>
        <p>La unidad de análisis es la base química, es decir el vehículo de la fórmula sin colorantes. Esa decisión es la que permite comparar un labial rojo con uno nude y afirmar algo con sentido sobre ambos.</p>

        <h2>Alcance y honestidad del proyecto</h2>
        <p>Same Same es un proyecto académico de ciencia de datos y no mantiene relación comercial con ninguna de las marcas citadas. No vende productos, no recibe comisiones y no recomienda comprar. Su utilidad está en lo contrario: en decir con claridad cuándo la evidencia no alcanza para sostener una afirmación popular.</p>
        <p>Las limitaciones están declaradas en la sección de metodología y forman parte del resultado, no son una nota al pie.</p>
      </div>
    `);
  }

  // --------------------------------------------------------------------
  // Enrutador
  // --------------------------------------------------------------------
  function analizarRuta() {
    const bruto = window.location.hash.replace(/^#\/?/, "") || "explorar";
    const [camino, consulta] = bruto.split("?");
    const partes = camino.split("/").filter(Boolean);
    const parametros = Object.fromEntries(new URLSearchParams(consulta || ""));
    return { vista: partes[0] || "explorar", argumento: partes[1], parametros };
  }

  async function enrutar() {
    const { vista, argumento, parametros } = analizarRuta();

    document.querySelectorAll(".navegacion a").forEach((a) =>
      a.classList.toggle("activo", a.dataset.ruta === vista)
    );
    document.getElementById("navegacion-movil").hidden = true;
    document.getElementById("boton-menu").setAttribute("aria-expanded", "false");

    try {
      if (vista === "producto" && argumento) await vistaProducto(argumento);
      else if (vista === "comparar" || vista === "validar") await vistaComparar(parametros);
      else if (vista === "marcas") await vistaMarcas();
      else if (vista === "como-funciona") await vistaComoFunciona();
      else if (vista === "nosotros") await vistaNosotros();
      else await vistaExplorar(parametros);
    } catch (e) {
      error(e.message);
    }
    if (vista !== "explorar") window.scrollTo({ top: 0 });
  }

  document.getElementById("boton-menu").addEventListener("click", (evento) => {
    const nav = document.getElementById("navegacion-movil");
    const abierto = !nav.hidden;
    nav.hidden = abierto;
    evento.currentTarget.setAttribute("aria-expanded", String(!abierto));
  });

  window.addEventListener("hashchange", enrutar);
  enrutar();
})();
