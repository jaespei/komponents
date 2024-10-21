/**
 * JointJS Component View Model.
 * 
 * Support for input/output/duplex ports.
 * Support for dynamic header/body/footer content.
 * 
 * Some refs:
 * truncating text
 * - https://stackoverflow.com/questions/23142350/proper-way-to-calculate-the-height-and-width-of-a-svg-text
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

import _ from 'lodash';
import joint from '../joint';
import common from '../common';

var ComponentViewModel = joint.shapes.basic.Generic.extend({
    markup: [
        '<g class="rotatable">',
        '<rect class="body" />',
        '<rect class="header" />',
        '<rect class="footer" />',
        '<rect class="menu" />',
        '<g class="highlighter">',
        '<rect class="topleft" />',
        '<rect class="topright" />',
        '<rect class="bottomleft" />',
        '<rect class="bottomright" />',
        '</g>',
        '<g class="body-content" />',
        '<g class="header-content" />',
        '<g class="footer-content" />',
        '<title />', // tootltip text 
        /*'<path class="resize" d="M22,22H20V20H22V22M22,18H20V16H22V18M18,22H16V20H18V22M18,18H16V16H18V18M14,22H12V20H14V22M22,14H20V12H22V14Z" />',
        '<rect class="resize-wrapper" />',*/
        /*'<clipPath id="truncate-header"><rect class="truncate-header" /></clipPath>',
        '<clipPath id="truncate-body"><rect class="truncate-body" /></clipPath>',
        '<clipPath id="truncate-footer"><rect class="truncate-footer" /></clipPath>',*/
        '</g>'
    ].join(''),
    portMarkup: [
        '<g>',
        '<circle class="port-body"/>',
        //'<polygon class="port-body" points="-10,10 0,-10 10,10" transform="rotate(90)"/>',
        //'<circle class="port-internal"/>',
        '<text class="port-text" />',
        '<g class="highlighter">',
        '<rect class="top" />',
        '<rect class="left" />',
        '<rect class="bottom" />',
        '<rect class="right" />',
        '</g>',
        '</g>'
    ].join(''),
    /*portMarkup: [
        '<g>',
        '<rect class="port-body"/>',
        '<g class="highlighter">',
        '<rect class="top" />',
        '<rect class="left" />',
        '<rect class="bottom" />',
        '<rect class="right" />',
        '</g>',
        '</g>'
    ].join(''),*/
    portLabelMarkup: '<text class="port-label"/>',
    defaults: _.defaultsDeep({
        type: 'komponents.Component',
        inPorts: [],
        outPorts: [],
        inOutPorts: [],
        size: {
            width: common.DESIGN_COMPONENT_WIDTH,
            height: common.DESIGN_COMPONENT_HEIGHT
        },
        attrs: {
            '.': {
                magnet: false
            },
            '*': {
                cursor: 'default'
            },
            '.body': {
                refWidth: '100%',
                refHeight: '100%',
                stroke: common.DESIGN_COMPONENT_STROKE,
                fill: common.DESIGN_BODY_FILL,
                filter: {
                    name: 'dropShadow',
                    args: {
                        dx: 3,
                        dy: 3,
                        blur: 2,
                        color: 'gray'
                    }
                }
            },
            '.body-icon': {
                //cursor: 'pointer',
                "pointer-events": "all"
            },
            '.header': {
                visibility: 'hidden',
                ref: '.body',
                refX: 1,
                refY: 1,
                refWidth: -2,
                height: common.DESIGN_HEADER_HEIGHT,
                fill: common.DESIGN_HEADER_FILL,
                stroke: 'none'
            },
            '.menu': {
                ref: '.header',
                refX: '90%',
                refY: 0,
                width: 10,
                height: 10,
                fill: "white",
                stroke: "black",
                //cursor: 'pointer',
                "pointer-events": "all",
                event: 'component:menu:pointerdown',
            },
            '.highlighter': {
                visibility: 'hidden'
            },
            '.topleft': {
                ref: '.body',
                refX: -3,
                refY: -3,
                width: 6,
                height: 6,
                fill: 'blue'
            },
            '.topright': {
                ref: '.body',
                refDx: -3,
                refY: -3,
                width: 6,
                height: 6,
                fill: 'blue'
            },
            '.bottomright': {
                ref: '.body',
                refDx: -3,
                refDy: -3,
                width: 6,
                height: 6,
                fill: 'blue'
            },
            '.bottomleft': {
                ref: '.body',
                refX: -3,
                refDy: -3,
                width: 6,
                height: 6,
                fill: 'blue'
            },
            '.footer': {
                visibility: 'hidden',
                ref: '.body',
                refX: 1,
                refDy: -common.DESIGN_FOOTER_HEIGHT - 1,
                refWidth: -common.DESIGN_ICON_WIDTH - 1,
                height: common.DESIGN_FOOTER_HEIGHT
            },
            /*'.resize-wrapper': {
                ref: '.body',
                refDx: -common.DESIGN_ICON_WIDTH - 2,
                refDy: -common.DESIGN_ICON_WIDTH - 2,
                width: common.DESIGN_ICON_WIDTH + 6,
                height: common.DESIGN_ICON_WIDTH + 6,
                cursor: 'se-resize',
                fill: 'transparent'
            },
            '.resize': {
                ref: '.body',
                refDx: -common.DESIGN_ICON_WIDTH - 2,
                refDy: -common.DESIGN_ICON_WIDTH - 2,
                width: common.DESIGN_ICON_WIDTH,
                height: common.DESIGN_ICON_WIDTH,
                fill: common.DESIGN_COMPONENT_STROKE
            },*/
            '.truncate-header': {
                ref: '.header',
                refHeight: '100%',
                refWidth: -7
            },
            '.truncate-body': {
                ref: '.body',
                /*'ref-x': 1,
                'ref-y': HEADER_HEIGHT + 1,*/
                refHeight: -common.DESIGN_HEADER_HEIGHT - common.DESIGN_FOOTER_HEIGHT,
                refWidth: -7
            },
            '.truncate-footer': {
                ref: '.footer',
                refHeight: '100%',
                refWidth: -common.DESIGN_ICON_WIDTH
            }
        },
        ports: {
            groups: {
                'draggable': {
                    position: {
                        name: 'absolute'
                    },
                    attrs: {
                        '.port-label': {
                            fill: common.DESIGN_PORT_TITLE_FILL
                        },
                        '.port-text': {
                            refX: 0.5,
                            refY: 0.5,
                            xAlignment: 'middle',
                            yAlignment: 'middle',
                            fill: common.DESIGN_PORT_TITLE_FILL,
                            'font-size': 10
                        },
                        '.port-body': {
                            fill: '#fff',
                            stroke: common.DESIGN_PORT_STROKE,
                            r: common.DESIGN_PORT_RADIUS,
                            magnet: false,

                        },
                        /*'.port-internal': {
                            visibility: 'hidden',
                            fill: 'transparent',
                            stroke: 'gray',
                            r: common.DESIGN_PORT_RADIUS - 2,
                            magnet: false
                        },*/
                        '.highlighter': {
                            visibility: 'hidden',
                        },
                        '.top': {
                            ref: '.port-body',
                            refX: common.DESIGN_PORT_RADIUS - 2,
                            refY: -2,
                            width: 4,
                            height: 4,
                            fill: common.DESIGN_SELECT_COLOR
                        },
                        '.left': {
                            ref: '.port-body',
                            refX: -2,
                            refY: common.DESIGN_PORT_RADIUS - 2,
                            width: 4,
                            height: 4,
                            fill: common.DESIGN_SELECT_COLOR
                        },
                        '.bottom': {
                            ref: '.port-body',
                            refX: common.DESIGN_PORT_RADIUS - 2,
                            refY: common.DESIGN_PORT_RADIUS * 2 - 2,
                            width: 4,
                            height: 4,
                            fill: common.DESIGN_SELECT_COLOR
                        },
                        '.right': {
                            ref: '.port-body',
                            refX: common.DESIGN_PORT_RADIUS * 2 - 2,
                            refY: 8,
                            width: 4,
                            height: 4,
                            fill: common.DESIGN_SELECT_COLOR
                        },
                    }
                },
            }
        }
    }, joint.shapes.basic.Generic.prototype.defaults),

    /**
     * Initializes the component
     * 
     * @param {Object} [opts] - The options
     * @param {Object} [opts.header] - The header spec
     * @param {Object} [opts.body] - The body spec
     * @param {string} [opts.state] - The component state
     */
    initialize: function(opts) {
        //console.log('[ComponentViewModel] initialize(' + JSON.stringify(opts) + ')');
        opts = opts || {};
        /*var markup = opts.markup || this.markup;
        var attrs = opts.attrs || this.get('attrs');
*/
        joint.shapes.basic.Generic.prototype.initialize.apply(this, arguments);

        // set id
        var attrs = opts.attrs || this.get('attrs');


        if (opts.header) this.header(opts.header);
        if (opts.body) this.body(opts.body);
        if (opts.ports) this.resetPorts(opts.ports);

        this.state(opts.state || 'dynamic');

        /*if (opts.draggablePorts) this.set('draggablePorts', opts.draggablePorts);
        if (opts.inPorts) this.set('inPorts', opts.inPorts);
        if (opts.outPorts) this.set('outPorts', opts.outPorts);
        if (opts.inOutPorts) this.set('inOutPorts', opts.inOutPorts);*/


        //console.log('[ComponentViewModel] ports=' + this.getPorts());

        /*this.on('change:draggablePorts', this.updatePortItems, this);
        this.updatePortItems();*/
    },

    /**
     * Clean up listeners.
     */
    cleanUp: function() {
        //console.log('[ComponentViewModel] cleanUp()');
        //var self = this;

    },

    /**
     * Sets this component header.
     * 
     * @param {string|Object}  [header] - The header spec
     * @param {string|Object} [header.title] - The header title
     * @param {string|Object} [header.fill] - The header fill color
     * @param {string} [header.stroke] - The header stroke color
     * @param {Array.<string|Object>} header.icons - The header 24x24 icons (pict, color)
     */
    header: function(header) {
        //console.log('[ComponentViewModel] header(' + JSON.stringify(header) + ')');

        // - get current markup
        var markup = this.get('markup') || this.markup;
        // - get current attrs removing icons
        var attrs = _.pickBy(this.get('attrs'), function(val, key) {
            return !key.startsWith('#header-icon-');
        });

        // - cleanup ...
        if (this._header && this._header.cb) this.off('change:size', this._header.cb);
        delete this._header;

        // - compute header markup
        var headerMarkup = '';
        if (!header) {
            attrs['.header']['visibility'] = 'hidden';
        } else {
            if (_.isString(header)) header = { title: header };
            header.title = header.title || '';
            header.icons = header.icons || [];

            if (header.title) {
                headerMarkup += '<clipPath id="truncate-header-' + this.cid + '"><rect class="truncate-header" /></clipPath>';
                headerMarkup += '<text class="header-text" />';

                // - header style
                attrs['.header']['visibility'] = 'visible';
                attrs['.header']['fill'] = header.fill ||
                    (this.get('mode') === 'read' ?
                        common.DESIGN_HEADER_FILL :
                        common.DESIGN_WRITE_HEADER_FILL);

                attrs['.header-text'] = {
                    text: header.title.text || (_.isString(header.title) ? header.title : ''),
                    ref: '.header',
                    'ref-x': 10,
                    'ref-y': .5,
                    'y-alignment': 'middle',
                    fill: header.title.fill || common.DESIGN_HEADER_TITLE_FILL,
                    'clip-path': 'url(#truncate-header-' + this.cid + ')'
                };

                // - truncate text:
                //   clip-path gets applied before transforming text
                attrs['.truncate-header'] = {
                    ref: '.header',
                    refHeight: '100%'
                };
                if (header.icons.length) attrs['.truncate-header'].width = this.get('size').width - header.icons.length * (common.DESIGN_ICON_WIDTH + 2) - 22;
                else attrs['.truncate-header'].refWidth = -22; // 11(left) 11(right)

                // - define truncate handler
                if (header.icons.length) {
                    var self = this;
                    header.cb = function(model, val, opts) {
                        //console.log('change:size');
                        self.attr('.truncate-header/width', self.get('size').width - header.icons.length * (common.DESIGN_ICON_WIDTH + 2) - 7);
                    };
                    this.on('change:size', header.cb);
                }

            }

            // - compute icons
            _.each(header.icons, function(icon, i) {
                headerMarkup += '<g id="header-icon-' + i + '">' + (icon.pict || icon) + '</g>';
                attrs['#header-icon-' + i] = {
                    ref: i ? '#header-icon-' + (i - 1) : '.header',
                    fill: icon.fill || common.DESIGN_HEADER_ICON_FILL
                };
                if (i === 0) {
                    attrs['#header-icon-' + i]['ref-y'] = .5;
                    attrs['#header-icon-' + i]['y-alignment'] = 'middle';
                } else {
                    attrs['#header-icon-' + i]['ref-y'] = -1;
                }
                attrs['#header-icon-' + i][i ? 'ref-x' : 'ref-dx'] = -common.DESIGN_ICON_WIDTH - 2;
            });
        }

        // - replace markup
        var i1 = markup.indexOf('<g class="header-content"');
        var i2 = markup.indexOf('<g class="footer-content"');
        markup = markup.slice(0, i1) +
            '<g class="header-content" />' + headerMarkup +
            markup.slice(i2);

        this._header = header;
        this.set('markup', markup);
        this.set('attrs', attrs);

    },

    /**
     * Sets this component body.
     * 
     * @param {string|Object}  [body] - The body spec
     * @param {string} [body.text] - The body text
     * @param {string|Object} [body.icon] - The body main icon
     * @param {Array.<string|Object>} [body.icons] - The body icons
     */
    body: function(body) {
        //console.log('[ComponentViewModel] body(' + JSON.stringify(body) + ')');
        var self = this;

        // - get current markup
        var markup = self.get('markup') || self.markup;
        // - get current attrs removing icons
        var attrs = _.pickBy(self.get('attrs'), function(val, key) {
            return !key.startsWith('#body-icon');
        });

        // - cleanup
        delete self._body;

        // - compute body markup
        var bodyMarkup = '';
        if (!body) {
            bodyMarkup = '';
        } else {
            if (_.isString(body)) body = { title: body };
            body.title = body.title || ' ';
            body.icons = body.icons || [];

            bodyMarkup += '<clipPath id="truncate-body-' + self.cid + '"><rect class="truncate-body" /></clipPath>';

            // body style
            attrs['.body']['fill'] = body.fill ||
                (this.get('mode') === 'read' ?
                    common.DESIGN_BODY_FILL :
                    common.DESIGN_WRITE_BODY_FILL);
            attrs['.body']['stroke'] = body.stroke ||
                (this.get('mode') === 'read' ?
                    common.DESIGN_COMPONENT_STROKE :
                    common.DESIGN_WRITE_COMPONENT_STROKE);

            // - body title
            if (body.title) {
                bodyMarkup += '<text class="body-text" />';

                attrs['.body-text'] = {
                    /*textWrap: {
                        text: body.title.text || body.title,
                        width: '90%',
                        height: '50%'
                    },*/
                    text: body.title.text || body.title,
                    ref: '.body',
                    refX: 5,
                    refY: .5,
                    refY2: 10,
                    /*xAlignment: 'middle',*/
                    yAlignment: 'middle',
                    fill: body.title.fill ||
                        (this.get('mode') === 'read' ?
                            common.DESIGN_BODY_TITLE_FILL :
                            common.DESIGN_WRITE_BODY_TITLE_FILL),
                    'clip-path': 'url(#truncate-body-' + self.cid + ')'
                };
            }

            // - body icon
            if (body.icon) {
                bodyMarkup += '<g id="body-icon" class="body-icon">' + (body.icon.pict || body.icon) + '</g>';
                attrs['#body-icon'] = {
                    ref: '.body',
                    refX: .5,
                    refY: .5,
                    refY2: 10,
                    refWidth: .5,
                    xAlignment: 'middle',
                    yAlignment: 'middle',
                    fill: body.icon.fill ||
                        (this.get('mode') === 'read' ?
                            common.DESIGN_BODY_ICON_FILL :
                            common.DESIGN_WRITE_BODY_ICON_FILL),
                    'clip-path': 'url(#truncate-body-' + self.cid + ')'
                };
            }

            // - compute icons
            body.icons = _.map(body.icons, function(icon) {
                return _.isString(icon) ? { pict: icon } : icon;
            });
            _.each(body.icons, function(icon, i) {
                icon.id = i;
                bodyMarkup += '<g id="body-icon-' + i + '" class="body-icon">' + icon.pict + '</g>';
                attrs['#body-icon-' + i] = {
                    ref: i ? '#body-icon-' + (i - 1) : '.body',
                    fill: icon.fill ||
                        (self.get('mode') === 'read' ?
                            common.DESIGN_BODY_ICON_FILL :
                            common.DESIGN_WRITE_BODY_ICON_FILL),
                    'clip-path': 'url(#truncate-body-' + self.cid + ')'
                };
                if (i === 0) {
                    attrs['#body-icon-' + i].refY = .5;
                    //attrs['#body-icon-' + i].refY2 = 10;
                    //attrs['#body-icon-' + i].yAlignment = 'middle';
                    attrs['#body-icon-' + i].refDx = -36;
                    icon.x = self.size().width - 36;
                } else {
                    attrs['#body-icon-' + i].refY = -1;
                    attrs['#body-icon-' + i].refX = -26;
                    icon.x = self.size().width - (i + 1) * 26 - 12;
                }
                icon.y = 0.5 * self.size().height; // + 10;
                icon.width = 24;
                icon.height = 24;

                //attrs['#body-icon-' + i][i ? 'refDx' : 'refX'] = 2;
            });

        }

        var i1 = markup.indexOf('<g class="body-content"');
        var i2 = markup.indexOf('<g class="header-content"');
        markup = markup.slice(0, i1) +
            '<g class="body-content" />' + bodyMarkup +
            markup.slice(i2);

        self._body = body;
        self.set('markup', markup);
        self.set('attrs', attrs);

    },

    /**
     * Sets this component footer.
     * 
     * @param {string|Object} [footer] - The footer spec
     * @param {string|Object} [footer.fill] - The footer fill color
     * @param {string|Object} [footer.title] - The footer title
     * @param {string|Object} [footer.title.fill] - The footer title fill color
     * @param {Array.<string|Object>} header.icons - The header 24x24 icons (pict, color)
     */
    footer: function(footer) {
        //console.log('[ComponentViewModel] footer(' + JSON.stringify(footer) + ')');
        var self = this;

        // - get current markup
        var markup = self.get('markup') || self.markup;
        // - get current attrs
        var attrs = _.clone(self.get('attrs'));

        // - cleanup
        delete self._footer;

        // - compute footer markup
        var footerMarkup = '';
        if (!footer) {
            attrs['.footer']['visibility'] = 'hidden';
        } else {
            if (_.isString(footer)) footer = { title: footer };
            footer.title = footer.title || ' ';

            footerMarkup += '<clipPath id="truncate-footer-' + self.cid + '"><rect class="truncate-footer" /></clipPath>';
            footerMarkup += '<text class="footer-text" />';

            // - footer style
            attrs['.footer']['visibility'] = 'visible';
            attrs['.footer']['fill'] = footer.fill ||
                (this.get('mode') === 'read' ?
                    common.DESIGN_FOOTER_FILL :
                    common.DESIGN_WRITE_FOOTER_FILL);
            attrs['.footer-text'] = {
                text: footer.title.text || footer.title,
                ref: '.footer',
                refX: 10,
                refDy: -2,
                'y-alignment': 'bottom',
                'font-size': '0.75em',
                fill: footer.title.fill ||
                    (this.get('mode') === 'read' ?
                        common.DESIGN_FOOTER_TITLE_FILL :
                        common.DESIGN_WRITE_FOOTER_TITLE_FILL),
                'clip-path': 'url(#truncate-footer-' + self.cid + ')'
            };

        }

        // - replace markup
        var i1 = markup.indexOf('<g class="footer-content"');
        var i2 = markup.indexOf('<title />');
        markup = markup.slice(0, i1) +
            '<g class="footer-content" />' + footerMarkup +
            markup.slice(i2);

        self._footer = footer;
        self.set('markup', markup);
        self.set('attrs', attrs);

    },

    /**
     * Sets/returns the current component state.
     * 
     * @param {string} [state] - The component state
     * @return {string} The current component state
     */
    state: function(value) {
        //console.log('[ComponentViewModel] state(' + value + ')');
        if (value) this._state = value;
        else return this._state;
    },

    /**
     * Selects this component.
     * 
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.type] - The highlighting type
     * @param {boolean} [value] - The value
     */
    highlight: function(opts, value) {
        //console.log('[ComponentViewModel] highlight(' + JSON.stringify(opts) + ',' + value + ')');
        var self = this;

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'select' };

        if (_.isBoolean(value)) {
            // update highlighter
            if (opts.type === 'select') {
                self.attr('.highlighter/visibility', value ? 'visible' : 'hidden');
                self.attr('.topleft/fill',
                    self.get('mode') === 'read' ?
                    common.DESIGN_SELECT_COLOR :
                    common.DESIGN_WRITE_SELECT_COLOR);
                self.attr('.topright/fill',
                    self.get('mode') === 'read' ?
                    common.DESIGN_SELECT_COLOR :
                    common.DESIGN_WRITE_SELECT_COLOR);
                self.attr('.bottomright/fill',
                    self.get('mode') === 'read' ?
                    common.DESIGN_SELECT_COLOR :
                    common.DESIGN_WRITE_SELECT_COLOR);
                self.attr('.bottomleft/fill',
                    self.get('mode') === 'read' ?
                    common.DESIGN_SELECT_COLOR :
                    common.DESIGN_WRITE_SELECT_COLOR);
            } else if (opts.type === 'light') {
                self.attr('.body',
                    (value ? {
                        stroke: (self.get('mode') === 'read' ? common.DESIGN_COMPONENT_STROKE : common.DESIGN_WRITE_COMPONENT_STROKE),
                        'stroke-width': 2
                    } : {
                        stroke: (self.get('mode') === 'read' ? common.DESIGN_COMPONENT_STROKE : common.DESIGN_WRITE_COMPONENT_STROKE),
                        'stroke-width': 1
                    }));
            } else if (opts.type === 'strong') {
                self.attr('.body',
                    (value ? { stroke: 'red', 'stroke-width': 2 } : {
                        stroke: (self.get('mode') === 'read' ? common.DESIGN_COMPONENT_STROKE : common.DESIGN_WRITE_COMPONENT_STROKE),
                        'stroke-width': 1
                    }));
            }
        } else {
            // return highlighter state
            if (opts.type === 'select') return self.attr('.highlighter/visibility') === 'visible';
            else if (opts.type === 'light') return self.attr('.body/stroke-width') === 2;
            else if (opts.type === 'strong') return self.attr('.body/stroke') === 'red';
        }

    },

    /**
     * Adds a new port to the component.
     * 
     * @param {string|Object} port - The port to add
     * @param {string} port.id - The port identifier
     * @param {string} port.name - The port name
     * @param {string} [port.type] - The port type
     * @param {string|Object} [port.position] - The port position ('left', 'right')
     * @param {number} [port.position.x] - The x coordinate
     * @param {number} [port.position.y] - The y coordinate
     * @param {string} [port.background] - The port background color
     * @param {string} [port.color] - The port text color
     * @param {string} [port.border] - The port border color
     */
    addPort: function(port) {
        //console.log('[ComponentViewModel] addPort(' + JSON.stringify(port) + ')');
        var self = this;
        if (!port) throw new Error('Parameters missing');
        port = _.isString(port) ? { id: port, name: port } : port;
        port.name = port.name || '';
        port.type = port.type || 'in';
        port.group = 'draggable';
        port.attrs = {
            '.port-label': {
                text: port.name,
                fill: self.get('mode') === 'read' ?
                    common.DESIGN_PORT_TITLE_FILL : common.DESIGN_WRITE_PORT_TITLE_FILL
            },
            '.port-text': {
                text: port.type || '',
                fill: self.get('mode') === 'read' ?
                    common.DESIGN_PORT_TITLE_FILL : common.DESIGN_WRITE_PORT_TITLE_FILL
            },
            '.port-body': {
                stroke: self.get('mode') === 'read' ?
                    common.DESIGN_PORT_STROKE : common.DESIGN_WRITE_PORT_STROKE
            }
        };

        port.position = port.position || (port.type === 'in' ? 'left' : 'right');

        if (port.background) port.attrs['.port-body'].fill = port.background;
        if (port.color) port.attrs['.port-text'].fill = port.color;
        if (port.border) port.attrs['.port-body'].stroke = port.border;

        var ports = self.prop('ports/items') || [];
        self.prop('ports/items', ports.concat(port), { rewrite: true });

        self._updatePositions(port.position);

    },

    /**
     * Updates the specified port.
     * 
     * @param {Object} port - The port to update
     * @param {string} port.id - The port identifier
     * @param {string} [port.name] - The port name
     * @param {string} [port.type] - The port type
     * @param {string|Object} [port.position] - The port position ('left', 'right')
     * @param {number} [port.position.x] - The x coordinate
     * @param {number} [port.position.y] - The y coordinate
     * @param {string} [port.background] - The port background color
     * @param {string} [port.color] - The port text color
     * @param {string} [port.border] - The port border color
     */
    updatePort: function(port) {
        //console.log('[ComponentViewModel] updatePort(' + JSON.stringify(port) + ')');
        var self = this;
        if (!port) throw new Error('Parameters missing');
        if (!port.id) throw new Error('Port id missing');

        var current = self.getPort(port.id);
        if (!current) throw Error('Port \'' + port.id + '\' not found');

        _.defaultsDeep(port, current);
        port.attrs['.port-label'] = {
            text: port.name,
            fill: self.get('mode') === 'read' ?
                common.DESIGN_PORT_TITLE_FILL : common.DESIGN_WRITE_PORT_TITLE_FILL
        };
        port.attrs['.port-text'] = {
            text: port.type,
            fill: self.get('mode') === 'read' ?
                common.DESIGN_PORT_TITLE_FILL : common.DESIGN_WRITE_PORT_TITLE_FILL
        };
        port.attrs['.port-body'] = {
            stroke: self.get('mode') === 'read' ?
                common.DESIGN_PORT_STROKE : common.DESIGN_WRITE_PORT_STROKE
        }

        if (port.background) port.attrs['.port-body'].fill = port.background;
        if (port.color) port.attrs['.port-text'].fill = port.color;
        if (port.border) port.attrs['.port-body'].stroke = port.border;

        // - calculate position
        var ports;
        if (!port.position) {
            if (port.type !== current.type) {
                // - the port changes position
                if (port.type === 'in') port.position = 'left';
                else port.position = 'right';
                // - the port must go to the end of the 
                //   queue
                ports = _.filter(self.getPorts(), function(_port) { return _port.id !== port.id; });
                ports.push(port);
                self.prop('ports/items', ports, { rewrite: true });
                self._updatePositions(current.position);
                self._updatePositions(port.position);
            } else {
                port.position = current.position;
                self.portProp(port.id, port);
            }
        } else if (_.isString(port.position)) {
            self.portProp(port.id, port);
            if (port.position !== current.position) {
                self._updatePositions(current.position);
                self._updatePositions(port.position);
            }
        } else {
            var position;
            if (port.position.x > self.size().width / 2) position = 'right';
            else position = 'left';

            var positions = self.getPortsPositions('draggable');
            ports = _.filter(self.getPorts(), function(_port) { return _port.id !== port.id; });
            for (var i = 0; i < ports.length; i++) {
                if (ports[i].position === position && positions[ports[i].id].y > port.position.y) break;
            }
            port.position = position;
            ports.splice(i, 0, port);
            self.prop('ports/items', ports, { rewrite: true });
            self._updatePositions(port.position);
            if (port.position !== current.position) self._updatePositions(current.position);
        }

        /*
        var ports = _.filter(this.prop('ports/items'), function (_port) {
            return _port.id !== port.id;
        });
        this.prop('ports/items', ports.concat(port), { rewrite: true }); this.prop('ports/items', ports.concat(port), { rewrite: true });*/
    },

    /**
     * Removes the specified port from the component.
     * 
     * @param {string} id - The port to remove
     */
    removePort: function(id) {
        //console.log('[ComponentViewModel] removePort(' + id + ')');
        var self = this;
        if (!id) throw new Error('Parameters missing');
        if (!_.isString(id)) throw new Error('String was expected');

        var port = _.find(self.prop('ports/items'), function(_port) {
            return _port.id === id;
        });
        if (!port) throw Error('Port not found');

        var ports = _.filter(self.prop('ports/items'), function(_port) {
            return _port.id !== id;
        });
        self.prop('ports/items', ports, _.extend({ rewrite: true }));

        self._updatePositions(port.position);

    },

    /**
     * Resets ports.
     * 
     * @param {Array.<Object>} ports - The ports to reset
     */
    resetPorts: function(ports) {
        //console.log('[ComponentViewModel] resetPorts(' + JSON.stringify(ports) + ')');
        var self = this;

        // - update/remove current ports
        _.each(self.getPorts(), function(port, i) {
            var found = _.find(ports, function(p) { return p.id === port.id; });
            if (found) {
                self.updatePort({
                    id: found.id,
                    name: found.name,
                    type: found.type,
                    position: found.position || (port.type === found.type ? port.position : null),
                    background: found.background || port.background,
                    color: found.color || port.color,
                    border: found.border || port.border
                });
            } else {
                self.removePort(port.id);
            }
        });

        // - add new ports
        _.each(ports, function(port) {
            if (!self.getPort(port.id)) self.addPort(port);
        });
    },

    /**
     * Highlight the specified port.
     * 
     * @param {string} id - The port to highlight
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.type] - The highlighter type ('select', 'strong', 'light', 'background')
     * @param {string} [opts.color] - The highlighter color
     * @param {string} [opts.text] - The text color
     * @param {boolean} [value] - Highlight or not
     */
    highlightPort: function(id, opts, value) {
        //console.log('[ComponentViewModel] highlightPort(' + id + ',' + JSON.stringify(opts) + ',' + value + ')');
        var self = this;
        if (!id || !_.isString(id)) throw new Error('Port identifier missing');

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'select' };

        var hs = self.portProp(id, 'highlighters');
        if (_.isBoolean(value)) {
            // update highlighter
            hs = _.filter(hs, function(_h) { return _h.type !== opts.type; });
            value && hs.push(opts)
            self.portProp(id, 'highlighters', hs, { rewrite: true });
            self._updatePortHighlight(id);
        } else {
            // return highlighter state
            return _.find(hs, function(_h) { return _h.type === opts.type; });
        }

    },

    /**
     * Updates the highlighters of the specified port.
     * 
     * @param {string} id - The port to refresh
     */
    _updatePortHighlight: function(id) {
        //console.log('[ComponentViewModel] _updatePortHighlight(' + id + ')');
        var self = this;
        var hs = self.portProp(id, 'highlighters');

        var h = _.find(hs, function(_h) { return _h.type === 'select'; });
        self.portProp(id, 'attrs/.highlighter/visibility', (h ? 'visible' : 'hidden'));

        h = _.find(hs, function(_h) { return _h.type === 'light'; });
        self.portProp(id, 'attrs/.port-body', {
            stroke: (h && h.color ||
                (self.get('mode') === 'read' ?
                    common.DESIGN_PORT_STROKE :
                    common.DESIGN_WRITE_PORT_STROKE)
            ),
            'stroke-width': h ? 2 : 1
        });

        // - for published endpoints
        h = _.find(hs, function(_h) { return _h.type === 'strong'; });
        self.portProp(id, 'attrs/.port-body/fill', (h ? h.color || '#0277bd' : 'white'));
        self.portProp(id, 'attrs/.port-text/fill', (h ? h.text || 'white' : 'gray'));

    },

    /**
     * Update port positions.
     * 
     * @param {string} position - The position of the ports to update
     */
    _updatePositions: function(position) {
        //console.log('[ComponentViewModel] _updatePositions(' + position + ')');
        var self = this;

        // - obtain number of ports on the same side
        var ports = _.filter(self.getPorts(), function(port) { return port.position === position; });

        // - calculate space between ports
        var diff = Math.floor(self.get('size').height / (ports.length + 1));

        // - change all port positions
        var i = 1;
        _.each(ports, function(port) {
            self.portProp(port.id, {
                label: {
                    position: (position === 'left' ? { name: 'left', args: { x: -15, y: -10 } } : { name: 'right', args: { x: 15, y: -10 } })
                },
                args: { x: (position === 'left' ? 0 : self.get('size').width), y: (i++) * diff }
            });
        });

    },

    /**
     * Retrieves the specified port position.
     * 
     * @param {string} id - The port identifier
     */
    getPortPosition: function(id) {
        var self = this;
        return _.find(self.getPortsPositions('draggable'), function(pos, _id) {
            return id === _id;
        });
    },

    /**
     * Find component port from the given local point.
     * 
     * @param {Object} pt - The local point
     * @param {string} [type] - The port type
     */
    findPortFromPoint: function(pt, type) {
        var self = this;
        pt = joint.g.point({
            x: pt.x - self.get('position').x,
            y: pt.y - self.get('position').y
        });
        if (Math.abs(pt.x) > common.DESIGN_PORT_RADIUS && Math.abs(pt.x) < Math.abs(self.size().width - common.DESIGN_PORT_RADIUS))
            return null;

        var positions = self.getPortsPositions('draggable') || [];
        for (var name in positions) {
            if (type && self.getPort(name).type !== type) continue;
            var pos = positions[name];
            if (pt.distance(joint.g.point(pos.x, pos.y)) < 10) {
                // - over endpoint!!
                return self.getPort(name);
            }
        }
        return null;
    },

    /**
     * Find icon from the given local point.
     * 
     * @param {Object} pt - The local point
     */
    findIconFromPoint: function(pt) {
        var self = this;

        var icons = self._body.icons || [];
        if (icons.length === 0) return;

        pt = joint.g.point({
            x: pt.x - self.get('position').x,
            y: pt.y - self.get('position').y
        });
        var range = 0.5 * self.size().height;
        if (pt.y < range || pt.y > range + 24) return null;

        for (var i = 0; i < icons.length; i++) {
            if (pt.x > icons[i].x && pt.x < (icons[i].x + 24)) return icons[i];
        }

        return null;
    },

    /**
     * Highlight the specified icon.
     * 
     * @param {string} id - The icon to highlight
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.type] - The highlighter type ('select', 'strong', 'light', 'background')
     * @param {string} [opts.color] - The highlighter color
     * @param {string} [opts.text] - The text color
     * @param {boolean} [value] - Highlight or not
     */
    highlightIcon: function(id, opts, value) {
        //console.log('[ComponentViewModel] highlightIcon(' + id + ',' + JSON.stringify(opts) + ',' + value + ')');
        var self = this;
        if (id === undefined || !_.isNumber(id)) throw new Error('Icon identifier missing');

        var icons = self._body.icons || [];
        if (id >= icons.length) throw new Error('Icon not found');

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'light' };

        if (_.isBoolean(value)) {
            // update highlighter
            if (opts.type === 'light') {
                //self.attr('#body-icon-' + id + '/stroke-width', value? 2: 1);
                self.attr(
                    '#body-icon-' + id + '/fill',
                    value ?
                    common.DESIGN_BODY_ICON_FILL_HIGHLIGHTED :
                    common.DESIGN_BODY_ICON_FILL
                );
            }
        } else {
            // return highlighter state
            if (opts.type === 'light')
                return self.attr('#body-icon-' + id + '/fill') === common.DESIGN_BODY_ICON_FILL_HIGHLIGHTED;
        }

    },

    /**
     * Returns this model bounding box.
     * 
     * @return {Object} The model bounding box
     */
    getBBox: function() {
        var self = this;

        var rect = {
            x: self.position().x,
            y: self.position().y,
            width: self.size().width,
            height: self.size().height
        };

        var left, right;
        self.getPorts().forEach(function(port) {
            if (port.position === 'left') left = true;
            else if (port.position === 'right') right = true;
        });

        rect.x = rect.x - (left ? common.DESIGN_PORT_RADIUS : 0);
        rect.width = rect.width + (left ? common.DESIGN_PORT_RADIUS : 0) + (right ? common.DESIGN_PORT_RADIUS : 0);

        return joint.g.rect(rect);
    }

});

joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.Component = ComponentViewModel;

window.ComponentViewModel = ComponentViewModel;

export default ComponentViewModel;


/*
function truncate(el, text, width) {
    if (typeof el.getSubStringLength !== "undefined") {
        el.textContent = text;
        var len = text.length;
        while (el.getSubStringLength(0, len--) > width) { }
        el.textContent = text.slice(0, len) + "...";
    } else if (typeof el.getComputedTextLength !== "undefined") {
        while (el.getComputedTextLength() > width) {
            text = text.slice(0, -1);
            el.textContent = text + "...";
        }
    } else {
        // the last fallback
        while (el.getBBox().width > width) {
            text = text.slice(0, -1);
            // we need to update the textContent to update the boundary width
            el.textContent = text + "...";
        }
    }
}*/