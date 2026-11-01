// Rasterise SVG at exact pixel sizes (FC-R60, FC-R66). Browser only.
export function svgToCanvas(svg, w, h, rotate = false) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = rotate ? h : w;
      c.height = rotate ? w : h;
      const x = c.getContext('2d');
      if (rotate) { x.translate(0, w); x.rotate(-Math.PI / 2); }
      x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the label.')); };
    img.src = url;
  });
}

export const canvasToPng = (c) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG.'))), 'image/png'));
