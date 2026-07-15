document.addEventListener('DOMContentLoaded', () => {

  /* ── Element refs ─────────────────────────────────────────────────────── */
  const modal = document.getElementById('CustomGiftModal');
  if (!modal) return;

  const modalImg = document.getElementById('ModalMainImg');
  const modalTitle = document.getElementById('ModalTitle');
  const modalPrice = document.getElementById('ModalPrice');
  const modalDesc = document.getElementById('ModalDesc');
  const variantsCt = document.getElementById('ModalVariantsContainer');
  const variantIdFld = document.getElementById('ModalVariantId');
  const cartForm = document.getElementById('ModalCartForm');
  const statusEl = document.getElementById('ModalStatus');
  const submitBtn = document.getElementById('ModalSubmitBtn');

  let currentProduct = null;
  let selectedOpts = {};   /* { 0: 'Blue', 1: 'XS' } */

  /* ── '+' button listeners ─────────────────────────────────────────────── */
  document.querySelectorAll('.custom-gift-hotspot-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const card = btn.closest('.custom-gift-card');
      if (!card) return;

      /* 1. Simple data-attributes (always work) */
      const title = card.dataset.productTitle || '';
      const price = card.dataset.productPrice || '';
      const desc = card.dataset.productDesc || '';
      const imgUrl = card.dataset.productImage || '';

      /* 2. Full product JSON from <script type="application/json"> inside card */
      let product = null;
      const jsonEl = card.querySelector('script.product-json-data');
      if (jsonEl) {
        try {
          const rawJson = jsonEl.textContent.trim();
          product = JSON.parse(rawJson);
          console.log('[GiftGuide] Product parsed OK:', product.title, '| options:', product.options, '| variants:', product.variants && product.variants.length);
        } catch (err) {
          console.error('[GiftGuide] JSON parse FAILED:', err.message);
          /* Show the raw text to diagnose */
          console.error('[GiftGuide] Raw JSON was:', jsonEl.textContent.trim().slice(0, 300));
        }
      } else {
        console.warn('[GiftGuide] No script.product-json-data found in card!');
      }

      currentProduct = product;
      openPopup({ title, price, desc, imgUrl, product });
    });
  });

  /* ── Close handlers ──────────────────────────────────────────────────── */
  modal.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', closePopup);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  /* ── Open popup ──────────────────────────────────────────────────────── */
  function openPopup({ title, price, desc, imgUrl, product }) {
    /* Reset */
    statusEl.innerHTML = '';
    statusEl.className = 'custom-gift-popup-status';
    submitBtn.disabled = false;
    submitBtn.querySelector('span:first-child').textContent = 'ADD TO CART';
    variantsCt.innerHTML = '';
    selectedOpts = {};
    variantIdFld.value = '';

    /* Header fields */
    modalTitle.textContent = title;
    modalPrice.textContent = price;
    modalDesc.textContent = desc || 'Premium quality product from our curated collection.';

    /* Image */
    let src = imgUrl || '';
    if (src.startsWith('//')) src = 'https:' + src;
    modalImg.src = src;
    modalImg.alt = title;

    /* Build variant UI */
    if (product) {
      buildVariantUI(product);
    }

    /* Show */
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ── Build Color + Size selectors ────────────────────────────────────── */
  function buildVariantUI(product) {
    const options = product.options;   /* ["Size","Color"] — array of strings */
    const variants = product.variants;  /* [{id, option1, option2, price, available}, ...] */

    console.log('[GiftGuide] buildVariantUI — options:', options, 'variants count:', variants && variants.length);

    if (!options || !options.length || !variants || !variants.length) {
      console.warn('[GiftGuide] No options or variants found — skipping variant UI');
      return;
    }

    /* Skip products that only have the default "Title" option (single-variant) */
    if (options.length === 1 && options[0] === 'Title') {
      /* Just set the first (only) variant as selected */
      selectedOpts[0] = variants[0] ? variants[0].option1 : '';
      syncVariant(product);
      return;
    }

    /* ── Sort: Color first, Size second, others last ─────────────────────
       We sort INDICES (not the options array itself) so option1/option2/option3
       keys on variants stay correct for syncVariant lookups. */
    const sortedIndices = options
      .map((name, i) => i)
      .sort((a, b) => {
        const rank = name => {
          const n = name.toLowerCase();
          if (n.includes('color') || n.includes('colour')) return 0;
          if (n.includes('size')) return 2;
          return 1;
        };
        return rank(options[a]) - rank(options[b]);
      });

    sortedIndices.forEach(idx => {
      const optionName = options[idx];

      /* Shopify: variant.option1, .option2, .option3 */
      const optKey = 'option' + (idx + 1);
      const allVals = variants.map(v => v[optKey]).filter(Boolean);
      const uniqVals = [...new Set(allVals)];
      if (!uniqVals.length) return;

      /* Determine type FIRST so we know whether to pre-select */
      const isSizeOpt = optionName.toLowerCase().includes('size') || uniqVals.length > 4;

      /* Color → pre-select first. Size → NO pre-select, user must choose */
      if (!isSizeOpt) {
        selectedOpts[idx] = uniqVals[0];
      }

      const group = document.createElement('div');
      group.className = 'custom-gift-popup-variant-group';

      const label = document.createElement('label');
      label.className = 'custom-gift-popup-variant-label';
      label.textContent = optionName;
      group.appendChild(label);

      if (isSizeOpt) {
        group.appendChild(buildSizeDropdown(uniqVals, idx, product));
      } else {
        group.appendChild(buildColorButtons(uniqVals, idx, product));
      }

      variantsCt.appendChild(group);
    });

    syncVariant(product);
  }

  /* Dropdown [ Choose your size   ∨ ] */
  function buildSizeDropdown(vals, idx, product) {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-gift-popup-select-wrapper';

    const sel = document.createElement('select');
    sel.className = 'custom-gift-popup-select';
    sel.setAttribute('aria-label', 'Size');

    /* "Choose your size" placeholder — selected=true so it shows by default */
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose your size';
    placeholder.selected = true;   /* shown by default */
    placeholder.disabled = true;   /* can't re-select once user picks */
    sel.appendChild(placeholder);

    vals.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      /* Never pre-select any size — user must choose */
      sel.appendChild(opt);
    });

    sel.addEventListener('change', e => {
      selectedOpts[idx] = e.target.value;
      syncVariant(product);
    });

    const arrowBox = document.createElement('div');
    arrowBox.className = 'custom-gift-popup-select-arrow';
    /* Arrow rendered by CSS ::after — no textContent needed */

    wrapper.appendChild(sel);
    wrapper.appendChild(arrowBox);
    return wrapper;
  }

  /* Color buttons [ ■ White  |  ■ Black ] */
  function buildColorButtons(vals, idx, product) {
    const swatchMap = {
      white: '#ffffff', black: '#111111', red: '#cc2200', grey: '#888888', gray: '#888888',
      blue: '#1a4fa3', green: '#2e7d32', yellow: '#f9c800', pink: '#e91e8c',
      purple: '#7b1fa2', orange: '#e65100', brown: '#6d4c41', navy: '#0d2060',
      beige: '#d9c9a8', cream: '#f5f0e4',
    };

    const grid = document.createElement('div');
    grid.className = 'custom-gift-popup-color-grid';

    vals.forEach(val => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-gift-popup-color-btn' + (val === selectedOpts[idx] ? ' is-active' : '');
      btn.textContent = val;
      btn.style.setProperty('--swatch-color', swatchMap[val.toLowerCase()] || '#aaaaaa');

      btn.addEventListener('click', () => {
        grid.querySelectorAll('.custom-gift-popup-color-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        selectedOpts[idx] = val;
        syncVariant(product);
      });

      grid.appendChild(btn);
    });

    return grid;
  }

  /* ── Match selected options → variant → update price + id ────────────── */
  function syncVariant(product) {
    if (!product || !product.variants) return;

    const matched = product.variants.find(v =>
      product.options.every((_, i) => {
        /* Skip "Title" default option check */
        if (product.options[i] === 'Title') return true;
        return v['option' + (i + 1)] === selectedOpts[i];
      })
    );

    if (matched) {
      variantIdFld.value = matched.id;

      /* Use Shopify price from variant (cents) — format as store currency */
      const formatted = window.Shopify && window.Shopify.formatMoney
        ? window.Shopify.formatMoney(matched.price, '{{amount}}')
        : '$' + (matched.price / 100).toFixed(2);

      modalPrice.textContent = formatted;

      submitBtn.disabled = !matched.available;
      submitBtn.querySelector('span:first-child').textContent = matched.available ? 'ADD TO CART' : 'SOLD OUT';
    } else {
      variantIdFld.value = '';
    }
  }

  /* ── Close ────────────────────────────────────────────────────────────── */
  function closePopup() {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* ── AJAX add to cart ─────────────────────────────────────────────────── */
  cartForm.addEventListener('submit', async e => {
    e.preventDefault();
    const varId = variantIdFld.value;
    if (!varId) {
      statusEl.textContent = 'Please select a size.';
      statusEl.className = 'custom-gift-popup-status is-error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('span:first-child').textContent = 'ADDING...';
    statusEl.innerHTML = '';
    statusEl.className = 'custom-gift-popup-status';

    const items = [{ id: parseInt(varId, 10), quantity: 1 }];

    /* Special rule: Black + Medium → auto-add Soft Winter Jacket */
    let addedJacket = false;
    if (currentProduct && currentProduct.options) {
      const isBlack = currentProduct.options.some((name, i) =>
        name.toLowerCase().includes('color') &&
        ['black'].includes((selectedOpts[i] || '').toLowerCase())
      );
      const isMedium = currentProduct.options.some((name, i) =>
        name.toLowerCase().includes('size') &&
        ['medium', 'm'].includes((selectedOpts[i] || '').toLowerCase())
      );
      if (isBlack && isMedium) {
        try {
          const r = await fetch('/products/dark-winter-jacket.js');
          if (r.ok) {
            const j = await r.json();
            const v = (j.variants || []).find(x => x.available) || (j.variants || [])[0];
            if (v) { items.push({ id: v.id, quantity: 1 }); addedJacket = true; }
          }
        } catch (_) { }
      }
    }

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        statusEl.textContent = addedJacket ? 'Added! (+Soft Winter Jacket)' : 'Added to cart!';
        statusEl.className = 'custom-gift-popup-status is-success';
        submitBtn.querySelector('span:first-child').textContent = 'ADDED ✓';
        setTimeout(() => {
          closePopup();
          if (typeof window.publish === 'function') window.publish('cart:refresh');
        }, 1400);
      } else {
        const err = await res.json().catch(() => ({}));
        statusEl.textContent = err.description || 'Could not add to cart.';
        statusEl.className = 'custom-gift-popup-status is-error';
        submitBtn.disabled = false;
        submitBtn.querySelector('span:first-child').textContent = 'TRY AGAIN';
      }
    } catch (_) {
      statusEl.textContent = 'Network error. Please try again.';
      statusEl.className = 'custom-gift-popup-status is-error';
      submitBtn.disabled = false;
      submitBtn.querySelector('span:first-child').textContent = 'TRY AGAIN';
    }
  });

});
