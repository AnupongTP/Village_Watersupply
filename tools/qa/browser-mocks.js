// QA-only compatibility mocks for external libraries blocked by the sandbox network policy.
// The application HTML/CSS/JS under test is unchanged; only CDN responses are intercepted.

(() => {
  // SweetAlert2 compatibility mock
  let swalContainer = null;
  window.Swal = {
    fire(options = {}) {
      window.Swal.close();
      swalContainer = document.createElement('div');
      swalContainer.className = 'swal2-container';
      swalContainer.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:12px;background:rgba(15,23,42,.45)';
      const popup = document.createElement('div');
      popup.className = 'swal2-popup';
      popup.style.cssText = `width:min(${typeof options.width === 'number' ? options.width + 'px' : (options.width || '32em')},calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:white;padding:20px;border-radius:14px;box-shadow:0 20px 45px rgba(15,23,42,.22)`;
      const title = document.createElement('h2');
      title.className = 'swal2-title';
      title.textContent = options.title || '';
      title.style.margin = '0 0 12px';
      popup.appendChild(title);
      if (options.text) {
        const text = document.createElement('p');
        text.textContent = options.text;
        popup.appendChild(text);
      }
      if (options.html) {
        const html = document.createElement('div');
        html.className = 'swal2-html-container';
        html.innerHTML = options.html;
        popup.appendChild(html);
      }
      if (options.showConfirmButton !== false) {
        const btn = document.createElement('button');
        btn.className = 'swal2-confirm';
        btn.textContent = options.confirmButtonText || 'ตกลง';
        btn.style.cssText = 'display:block;margin:16px auto 0;padding:9px 18px;border:0;border-radius:8px;background:#0369a1;color:#fff;font:inherit';
        btn.addEventListener('click', () => window.Swal.close());
        popup.appendChild(btn);
      }
      swalContainer.appendChild(popup);
      document.body.appendChild(swalContainer);
      options.didOpen?.();
      return Promise.resolve({ isConfirmed: true });
    },
    close() {
      swalContainer?.remove();
      swalContainer = null;
    },
    showLoading() {}
  };

  // Chart.js compatibility mock with lightweight canvas rendering.
  window.Chart = class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroyed = false;
      canvas.__chartConfig = config;
      requestAnimationFrame(() => this.draw());
    }
    destroy() {
      this.destroyed = true;
      if (this.canvas) this.canvas.__chartConfig = null;
    }
    draw() {
      if (this.destroyed || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(240, Math.round(rect.width || 600));
      const h = Math.max(180, Math.round(rect.height || 300));
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      const ctx = this.canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const cfg = this.config;
      const type = cfg.type;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#64748b';
      if (type === 'doughnut') {
        const values = cfg.data.datasets[0].data.map(Number);
        const colors = cfg.data.datasets[0].backgroundColor;
        const total = values.reduce((a,b)=>a+b,0) || 1;
        const cx = w/2, cy = h/2 - 12, r = Math.min(w,h)*0.28;
        let a = -Math.PI/2;
        values.forEach((v,i) => {
          const next = a + Math.PI*2*(v/total);
          ctx.beginPath(); ctx.arc(cx,cy,r,a,next); ctx.arc(cx,cy,r*.62,next,a,true); ctx.closePath();
          ctx.fillStyle = colors[i] || '#94a3b8'; ctx.fill(); a = next;
        });
        cfg.data.labels.forEach((label,i) => { ctx.fillStyle='#64748b'; ctx.fillText(label, 14 + i*Math.max(90,w/3), h-14); });
      } else {
        const horizontal = cfg.options?.indexAxis === 'y';
        const labels = cfg.data.labels || [];
        const datasets = cfg.data.datasets || [];
        const max = Math.max(1, ...datasets.flatMap(ds => ds.data.map(Number)));
        if (horizontal) {
          const rowH = Math.max(22, (h-30)/Math.max(1,labels.length));
          labels.forEach((label,i) => {
            ctx.fillStyle='#64748b'; ctx.fillText(String(label).slice(0,24), 8, 22+i*rowH);
            datasets.forEach((ds,j) => {
              const value=Number(ds.data[i]||0); const x=145; const barH=Math.max(5,rowH/(datasets.length+1));
              ctx.fillStyle=Array.isArray(ds.backgroundColor)?ds.backgroundColor[j]:ds.backgroundColor || '#0284c7';
              ctx.fillRect(x, 8+i*rowH+j*barH, (w-x-12)*(value/max), barH-2);
            });
          });
        } else {
          const plotH=h-55, plotW=w-50; const groupW=plotW/Math.max(1,labels.length);
          labels.forEach((label,i) => {
            datasets.forEach((ds,j) => {
              const value=Number(ds.data[i]||0); const bw=Math.max(5,groupW/(datasets.length+2));
              const bh=plotH*(value/max); const x=35+i*groupW+(j+0.5)*bw; const y=plotH-bh+10;
              ctx.fillStyle=Array.isArray(ds.backgroundColor)?ds.backgroundColor[j]:ds.backgroundColor || '#0284c7';
              ctx.fillRect(x,y,bw-2,bh);
            });
            ctx.save(); ctx.translate(35+i*groupW+8,h-8); ctx.rotate(-0.35); ctx.fillStyle='#64748b'; ctx.fillText(String(label).slice(0,12),0,0); ctx.restore();
          });
        }
      }
    }
  };

  // Leaflet compatibility mock: enough behavior to exercise app map logic and real layout/stacking.
  function createControlNode(className, html) {
    const node = document.createElement('div');
    node.className = className;
    node.innerHTML = html;
    return node;
  }

  function makeMap(id) {
    const el = document.getElementById(id);
    el.classList.add('leaflet-container');
    el.innerHTML = '';
    const tilePane = document.createElement('div');
    tilePane.className = 'leaflet-pane leaflet-tile-pane qa-map-background';
    const markerPane = document.createElement('div');
    markerPane.className = 'leaflet-pane leaflet-marker-pane';
    const popupPane = document.createElement('div');
    popupPane.className = 'leaflet-pane leaflet-popup-pane';
    const topLeft = createControlNode('leaflet-top leaflet-left', '<div class="leaflet-control leaflet-bar leaflet-control-zoom"><a href="#" aria-label="ซูมเข้า">+</a><a href="#" aria-label="ซูมออก">−</a></div>');
    const topRight = document.createElement('div'); topRight.className='leaflet-top leaflet-right';
    const bottomRight = document.createElement('div'); bottomRight.className='leaflet-bottom leaflet-right';
    const bottomLeft = createControlNode('leaflet-bottom leaflet-left', '<div class="leaflet-control-attribution">Leaflet | Tiles © Esri</div>');
    el.append(tilePane, markerPane, popupPane, topLeft, topRight, bottomRight, bottomLeft);

    const map = {
      _el: el, _markerPane: markerPane, _popupPane: popupPane, _topRight: topRight, _bottomRight: bottomRight,
      setView(center, zoom) { this._center=center; this._zoom=zoom; return this; },
      fitBounds(bounds) { this._bounds=bounds; return this; },
      invalidateSize() { return this; },
      addLayer(layer) { layer.addTo?.(this); return this; },
      addControl(control) {
        const node = control.onAdd?.(this);
        if (node) this._bottomRight.appendChild(node);
        return this;
      }
    };
    return map;
  }

  class LayerGroup {
    constructor() { this.layers=[]; this.map=null; }
    addTo(map) { this.map=map; return this; }
    clearLayers() { this.layers.forEach(l=>l._node?.remove()); this.layers=[]; }
    addLayer(layer) { this.layers.push(layer); layer._attach(this.map); return this; }
  }

  class CircleMarker {
    constructor(latlng, opts) { this.latlng={lat:latlng[0],lng:latlng[1]}; this.opts=opts; this.popup=''; }
    bindPopup(html) { this.popup=html; return this; }
    addTo(layer) { layer.addLayer(this); return this; }
    getLatLng() { return this.latlng; }
    _attach(map) {
      this.map=map;
      const n=document.createElement('button');
      n.type='button'; n.className='qa-leaflet-marker'; n.setAttribute('aria-label','จุดระบบประปา');
      const minLat=18.70,maxLat=20.00,minLng=99.40,maxLng=100.70;
      const x=((this.latlng.lng-minLng)/(maxLng-minLng))*92+4;
      const y=(1-(this.latlng.lat-minLat)/(maxLat-minLat))*88+6;
      n.style.cssText=`position:absolute;left:${x}%;top:${y}%;width:13px;height:13px;border-radius:999px;border:2px solid #fff;background:${this.opts.fillColor};box-shadow:0 1px 3px rgba(15,23,42,.5);transform:translate(-50%,-50%);padding:0;z-index:1`;
      n.addEventListener('click',()=>this.openPopup());
      map._markerPane.appendChild(n); this._node=n;
    }
    openPopup() {
      if (!this.map) return this;
      this.map._popupPane.innerHTML='';
      const p=document.createElement('div'); p.className='leaflet-popup qa-popup';
      p.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(315px,85%);background:#fff;padding:12px;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.2);z-index:1';
      p.innerHTML=this.popup; this.map._popupPane.appendChild(p); return this;
    }
  }

  const ControlBase = class { addTo(map) { map.addControl(this); return this; } };
  window.L = {
    map: id => makeMap(id),
    tileLayer: () => ({ addTo: map => map }),
    layerGroup: () => new LayerGroup(),
    circleMarker: (latlng, opts) => new CircleMarker(latlng, opts),
    control: {
      layers: () => ({ addTo(map) {
        const n=createControlNode('leaflet-control leaflet-control-layers','<button type="button" class="qa-layer-button" aria-label="ชั้นข้อมูล">▱</button>');
        map._topRight.appendChild(n); return this;
      }})
    },
    Control: {
      extend(definition) {
        return class extends ControlBase {
          constructor() { super(); this.options=definition.options || {}; }
          onAdd(map) { return definition.onAdd.call(this,map); }
        };
      }
    },
    DomUtil: {
      create(tag, className) { const node=document.createElement(tag); node.className=className; return node; }
    }
  };
})();
