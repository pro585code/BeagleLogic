var JsonML;
if (undefined === JsonML) { JsonML = {}; }

(function () {
	//attribute name mapping
	var ATTRMAP = {
			rowspan : "rowSpan",
			colspan : "colSpan",
			cellpadding : "cellPadding",
			cellspacing : "cellSpacing",
			tabindex : "tabIndex",
			accesskey : "accessKey",
			hidefocus : "hideFocus",
			usemap : "useMap",
			maxlength : "maxLength",
			readonly : "readOnly",
			contenteditable : "contentEditable"
			// can add more attributes here as needed
		},
		// attribute duplicates
		ATTRDUP = {
			enctype : "encoding",
			onscroll : "DOMMouseScroll"
			// can add more attributes here as needed
		},
		// event names
		EVTS = (function (/*string[]*/ names) {
			var evts = {}, evt;
			while (names.length) {
				evt = names.shift();
				evts["on" + evt.toLowerCase()] = evt;
			}
			return evts;
		})("blur,change,click,dblclick,error,focus,keydown,keypress,keyup,load,mousedown,mouseenter,mouseleave,mousemove,mouseout,mouseover,mouseup,resize,scroll,select,submit,unload".split(','));

	/*void*/ function addHandler(/*DOM*/ elem, /*string*/ name, /*function*/ handler) {
		if ("string" === typeof handler) {
			/*jslint evil:true */
			handler = new Function("event", handler);
			/*jslint evil:false */
		}

		if ("function" !== typeof handler) {
			return;
		}

		elem[name] = handler;
	}

	/*DOM*/ function addAttributes(/*DOM*/ elem, /*object*/ attr) {
		if (attr.name && document.attachEvent) {
			try {
				// IE fix for not being able to programatically change the name attribute
				var alt = document.createElement("<" + elem.tagName + " name='" + attr.name + "'>");
				// fix for Opera 8.5 and Netscape 7.1 creating malformed elements
				if (elem.tagName === alt.tagName) {
					elem = alt;
				}
			} catch (ex) { }
		}

		// for each attributeName
		for (var name in attr) {
			if (attr.hasOwnProperty(name)) {
				// attributeValue
				var value = attr[name];
				if (name && value !== null && "undefined" !== typeof value) {
					name = ATTRMAP[name.toLowerCase()] || name;
					if (name === "style") {
						if ("undefined" !== typeof elem.style.cssText) {
							elem.style.cssText = value;
						} else {
							elem.style = value;
						}
					} else if (name === "class") {
						elem.className = value;
						elem.setAttribute(name, value);
					} else if (EVTS[name]) {
						addHandler(elem, name, value);

						// also set duplicated events
						if (ATTRDUP[name]) {
							addHandler(elem, ATTRDUP[name], value);
						}
					} else if ("string" === typeof value || "number" === typeof value || "boolean" === typeof value) {
						elem.setAttribute(name, value);

						// also set duplicated attributes
						if (ATTRDUP[name]) {
							elem.setAttribute(ATTRDUP[name], value);
						}
					} else {

						// allow direct setting of complex properties
						elem[name] = value;

						// also set duplicated attributes
						if (ATTRDUP[name]) {
							elem[ATTRDUP[name]] = value;
						}
					}
				}
			}
		}
		return elem;
	}

	/*void*/ function appendChild(/*DOM*/ elem, /*DOM*/ child) {
		if (child) {
			if (elem.tagName && elem.tagName.toLowerCase() === "table" && elem.tBodies) {
				if (!child.tagName) {
					// must unwrap documentFragment for tables
					if (child.nodeType === 11) {
						while (child.firstChild) {
							appendChild(elem, child.removeChild(child.firstChild));
						}
					}
					return;
				}
				// in IE must explicitly nest TRs in TBODY
				var childTag = child.tagName.toLowerCase();// child tagName
				if (childTag && childTag !== "tbody" && childTag !== "thead") {
					// insert in last tbody
					var tBody = elem.tBodies.length > 0 ? elem.tBodies[elem.tBodies.length - 1] : null;
					if (!tBody) {
						tBody = document.createElement(childTag === "th" ? "thead" : "tbody");
						elem.appendChild(tBody);
					}
					tBody.appendChild(child);
				} else if (elem.canHaveChildren !== false) {
					elem.appendChild(child);
				}
			} else if (elem.tagName && elem.tagName.toLowerCase() === "style" && document.createStyleSheet) {
				// IE requires this interface for styles
				elem.cssText = child;
			} else if (elem.canHaveChildren !== false) {
				elem.appendChild(child);
			} else if (elem.tagName && elem.tagName.toLowerCase() === "object" &&
				child.tagName && child.tagName.toLowerCase() === "param") {
					// IE-only path
				try {
					elem.appendChild(child);
				} catch (ex1) {}
				try {
					if (elem.object) {
						elem.object[child.name] = child.value;
					}
				} catch (ex2) {}
			}
		}
	}

	/*bool*/ function isWhitespace(/*DOM*/ node) {
		return node && (node.nodeType === 3) && (!node.nodeValue || !/\S/.exec(node.nodeValue));
	}

	/*void*/ function trimWhitespace(/*DOM*/ elem) {
		if (elem) {
			while (isWhitespace(elem.firstChild)) {
				// trim leading whitespace text nodes
				elem.removeChild(elem.firstChild);
			}
			while (isWhitespace(elem.lastChild)) {
				// trim trailing whitespace text nodes
				elem.removeChild(elem.lastChild);
			}
		}
	}

	/*DOM*/ function hydrate(/*string*/ value) {
		var wrapper = document.createElement("div");
		wrapper.innerHTML = value;

		// trim extraneous whitespace
		trimWhitespace(wrapper);

		// eliminate wrapper for single nodes
		if (wrapper.childNodes.length === 1) {
			return wrapper.firstChild;
		}

		// create a document fragment to hold elements
		var frag = document.createDocumentFragment ?
			document.createDocumentFragment() :
			document.createElement("");

		while (wrapper.firstChild) {
			frag.appendChild(wrapper.firstChild);
		}
		return frag;
	}

	function Unparsed(/*string*/ value) {
		this.value = value;
	}
	// default error handler
	/*DOM*/ function onError(/*Error*/ ex, /*JsonML*/ jml, /*function*/ filter) {
		return document.createTextNode("[" + ex + "]");
	}

	/* override this to perform custom error handling during binding */
	JsonML.onerror = null;

	/*DOM*/ function patch(/*DOM*/ elem, /*JsonML*/ jml, /*function*/ filter) {

		for (var i = 1; i < jml.length; i++) {
			if (jml[i] instanceof Array || "string" === typeof jml[i]) {
				// append children
				appendChild(elem, JsonML.parse(jml[i], filter));
			} else if (jml[i] instanceof Unparsed) {
				appendChild(elem, hydrate(jml[i].value));
			} else if ("object" === typeof jml[i] && jml[i] !== null && elem.nodeType === 1) {
				// add attributes
				elem = addAttributes(elem, jml[i]);
			}
		}

		return elem;
	}

	/*DOM*/ JsonML.parse = function (/*JsonML*/ jml, /*function*/ filter) {
		try {
			if (!jml) {
				return null;
			}
			if ("string" === typeof jml) {
				return document.createTextNode(jml);
			}
			if (jml instanceof Unparsed) {
				return hydrate(jml.value);
			}
			if (!JsonML.isElement(jml)) {
				throw new SyntaxError("invalid JsonML");
			}

			var tagName = jml[0]; // tagName
			if (!tagName) {
				// correctly handle a list of JsonML trees
				// create a document fragment to hold elements
				var frag = document.createDocumentFragment ?
					document.createDocumentFragment() :
					document.createElement("");
				for (var i = 1; i < jml.length; i++) {
					appendChild(frag, JsonML.parse(jml[i], filter));
				}

				// trim extraneous whitespace
				trimWhitespace(frag);

				// eliminate wrapper for single nodes
				if (frag.childNodes.length === 1) {
					return frag.firstChild;
				}
				return frag;
			}

			if (tagName.toLowerCase() === "style" && document.createStyleSheet) {
				// IE requires this interface for styles
				JsonML.patch(document.createStyleSheet(), jml, filter);
				// in IE styles are effective immediately
				return null;
			}
			svgns   = 'http://www.w3.org/2000/svg';
			var elem;
			elem = patch(document.createElementNS(svgns, tagName), jml, filter);
			// trim extraneous whitespace
			trimWhitespace(elem);
			return (elem && "function" === typeof filter) ? filter(elem) : elem;
		} catch (ex) {
			try {
				// handle error with complete context
				var err = ("function" === typeof JsonML.onerror) ? JsonML.onerror : onError;
				return err(ex, jml, filter);
			} catch (ex2) {
				return document.createTextNode("[" + ex2 + "]");
			}
		}
	};

	/*bool*/ JsonML.isElement = function (/*JsonML*/ jml) {
		return (jml instanceof Array) && ("string" === typeof jml[0]);
	};
})();

var RouteDrom = RouteDrom || {};

RouteDrom.Init = function (label) {
  function random_aro () {
    var  i, ilen, ret = [];
    ilen = 30; //*Math.random();
    for (i = 0; i < ilen; i++) {
      ret.push(Math.floor(10 *Math.random()));
    }
    return ret;
  };
  function edges (aro) {
    var i, ilen, ret = [];
    ilen = aro.length;
    for (i = 0; i < ilen; i++) {
      if ('undefined' === typeof ret[aro[i]]) {
        ret[aro[i]] = [];
      }
      ret[aro[i]].push(i);
    }
    return ret;
  };
  function slots (aro, hyp) {
    var m, mlen, k, j, i, ilen, ret = [], heap = [];
    ilen = aro.length;
    for (i = 0; i < ilen; i++) {
      j = aro[i];
      k = hyp[j];
      if (k.length > 1) {
        if (k[0] === i) { // allocate slot
          heap.push(null);
          mlen = heap.length;
          for (m = 0; m < mlen; m++) {
            if (heap[m] === null) {
              heap[m] = j;
              ret[j] = m+2;
              break;
            }
          }
        } else if (k.slice(-1)[0] === i) { // release slot
          mlen = heap.length;
          for (m = 0; m < mlen; m++) {
            if (heap[m] === j) {
              heap[m] = null;
              break;
            }
          }
        }
      }
    }
    ilen = ret.length;
    for (i = 0; i < ilen; i++) {
      if ('undefined' === typeof ret[i]) {
        ret[i] = null;
      }
    }
    ret.push(null);
    return ret;
  };
  function draw (aro, hyp, slt, xmax) {
    var x, x1, y, y1, ys, i, ilen, j, jlen, svg, ret = ['g'];
    ilen = hyp.length;
    for (i = 0; i < ilen; i++) {
      ys = hyp[i];
      if ('undefined' === typeof ys) { continue; }
      svg = ['g', ['title', i+'']];
      x = slt[i];
      y = ys[0];
      if (x === null) {
        svg.push(['path', {d: 'm 0,'+(16*y)+' '+(16*xmax)+',0', class:'wire'}]);
        ret.push(svg);
        continue;
      };
      svg.push(['path', {d: 'm 0,'+(16*y)+' '+(16*x)+',0', class:'wire'}]);
      y1 = ys.slice(-1)[0] - y;
      svg.push(['path', {d: 'm '+(16*x)+','+(16*y)+' 0,'+(16*y1), class:'wire'}]);
      jlen = ys.length;
      for (j = 0; j < jlen; j++) {
        y = ys[j];
        x1 = xmax-x;
        svg.push(['path', {d: 'm '+(16*x)+','+(16*y)+' '+(16*x1)+',0', class:'wire'}]);
        if (j < (jlen-1)) {
          svg.push(['g',
            {transform: 'translate('+(16*x)+','+(16*y)+')'},
            ['path', {d:'M 2,0 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z'}],
          ]);
        }
      }
      ret.push(svg);
    }
    return ret;
  };

  // Hypergraph crossing
	var aro, hyp, slt, xmax, svg;
	aro = random_aro();
	console.log (aro);
  hyp = edges (aro);
  console.log (JSON.stringify(hyp));
  slt = slots (aro, hyp);
  console.log (slt);
  xmax = Math.max.apply(Math, slt) + 2;
  console.log (xmax);
  svg = draw (aro, hyp, slt, xmax);
	document.getElementById(label).insertBefore(JsonML.parse(svg), null);
};
