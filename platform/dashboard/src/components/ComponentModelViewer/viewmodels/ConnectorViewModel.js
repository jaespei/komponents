/**
 * JointJS Connector View Model.
 * 
 * Some refs:
 * truncating text
 * - https://stackoverflow.com/questions/23142350/proper-way-to-calculate-the-height-and-width-of-a-svg-text
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

import $ from 'jquery';
import _, { sortedLastIndex } from 'lodash';
import Backbone from 'backbone';
import joint from '../joint';
import common from '../common';

var ConnectorViewModel = joint.shapes.basic.Generic.extend({
    markup: [
        '<g class="rotatable">',
        '<circle class="body" />',
        '<circle class="inner-body" />',
        //'<circle class="body-internal" />',
        //'<clipPath id="truncate-body"><rect class="truncate-body" /></clipPath>',
        //'<text class="body-text" clip-path="url(#truncate-body)" />',     
        '<text class="body-text" />',
        '<g class="header">',
        common.icons.eye,
        '</g>',
        '<g class="highlighter">',
        '<rect class="top" />',
        '<rect class="right" />',
        '<rect class="bottom" />',
        '<rect class="left" />',
        '</g>',
        '</g>'
    ].join(''),
    defaults: _.defaultsDeep({
        //type: 'komponents.Connector',
        type: "connector",
        size: {
            width: common.DESIGN_CONNECTOR_WIDTH,
            height: common.DESIGN_CONNECTOR_HEIGHT
        },
        attrs: {
            '.': {
                magnet: false
            },
            '*': {
                cursor: 'default'
            },        
            '.body': {
                refCx: '50%',
                refCy: '50%',
                r: common.DESIGN_CONNECTOR_RADIUS,
                stroke: common.COLOR_FOREGROUND,
                fill: common.COLOR_BACKGROUND,
                /*filter: {
                    name: 'dropShadow',
                    args: {
                        dx: 3,
                        dy: 3,
                        blur: 2,
                        color: 'gray'
                    }
                }*/
            },
            '.inner-body': {
                refCx: '50%',
                refCy: '50%',
                r: common.DESIGN_CONNECTOR_RADIUS - 7,
                stroke: common.COLOR_FOREGROUND,
                fill: "transparent",
                display: "none"
            },
            /*'.body-internal': {
                visibility: 'hidden',
                refCx: '50%',
                refCy: '50%',
                r: common.DESIGN_CONNECTOR_RADIUS-10,
                stroke: common.DESIGN_CONNECTOR_STROKE,
                fill: 'transparent'
            },*/
            '.body-text': {
                ref: '.body',
                //refX: .5,
                refX: .5,
                refY: .5,
                yAlignment: 'middle',
                xAlignment: 'middle',
                fill: 'gray',
                //'font-size': 18, 
            },
            '.header': {
                ref: '.body',
                refX: 28,
                refY: 5,
                fill: common.COLOR_FOREGROUND,
                visibility: "hidden"
            },
            '.highlighter': {
                visibility: 'hidden'
            },
            '.top': {
                ref: '.body',
                refX: common.DESIGN_CONNECTOR_RADIUS - 3,
                refY: -3,
                width: 6,
                height: 6,
                fill: common.COLOR_FOREGROUND
            },
            '.left': {
                ref: '.body',
                refX: -3,
                refY: common.DESIGN_CONNECTOR_RADIUS - 3,
                width: 6,
                height: 6,
                fill: common.COLOR_FOREGROUND
            },
            '.bottom': {
                ref: '.body',
                refX: common.DESIGN_CONNECTOR_RADIUS - 3,
                refDy: - 3,
                width: 6,
                height: 6,
                fill: common.COLOR_FOREGROUND
            },
            '.right': {
                ref: '.body',
                refDx: - 3,
                refY: common.DESIGN_CONNECTOR_RADIUS - 3,
                width: 6,
                height: 6,
                fill: common.COLOR_FOREGROUND
            },
            /*'.truncate-body': {
                ref: '.body',
                refX: 0,
                refY: 0,
                refHeight: "100%",
                refWidth: "100%",
            },*/
        },
    }, joint.shapes.basic.Generic.prototype.defaults),

    /**
     * Initializes the connector.
     * 
     * @param {Object} [opts] - The options
     * @param {Object} [opts.id] - The connector id
     * @param {Object} [opts.name] - The connector name
     * @param {string} [opts.mode] - The role mode ('read', 'write')
     * @param {string} [opts.component] - The role mode ('read', 'write')
     * @param {boolean} [opts.published] - Published connector
     * @param {string} [opts.color] - The connector color
     */
    initialize: function (opts) {
        common.log('[ConnectorVieModel] initialize(' + JSON.stringify(opts) + ')');
        var self = this;

        opts = opts || {};
        opts.name = opts.name || 'none';
        opts.published = opts.published || false;

        joint.shapes.basic.Generic.prototype.initialize.apply(this, arguments);

        self.refresh(opts);

        self.callbacks = {
            refresh: function () {
                self.refresh();
            }
        }

        /*self.on('change:name', self.callbacks.refresh);
        self.on('change:published', self.callbacks.refresh);*/

    },

    /**
     * Clean up listeners.
     */
    cleanUp: function () {
        common.log('[ConnectorVM] cleanUp()');
        var self = this;

        /*self.off('change:name', self.callbacks.refresh);
        self.off('change:published', self.callbacks.refresh);*/

    },

    /**
     * Refreshes this connector display. Required when changes
     * on the connector are performed.
     * 
     * @param {Object} [opts] - Additional options
     * @param {string}
     */
    refresh: function (opts) {
        var self = this;
        common.log('[ConnectorVM] refresh(' + JSON.stringify(opts) + ')');

        self.attr({
            '.body-text': {
                text: self.get('name'),
                'text-transform': 'uppercase'
            },
            '.body': {
                fill: self.get("color") || common.COLOR_BACKGROUND
            }
        });

        if (self.get("published")) {
            // - we add icon/double circle/background
            self.attr(".inner-body/display", "block");  
            //self.attr(".header/visibility", "visible");            
            //self.attr(".body/fill", common.COLOR_FOREGROUND);
        } else {
            self.attr(".inner-body/display", "none");
            //self.attr(".header/visibility", "hidden");
            //self.attr(".body/fill", self.get("color") || common.COLOR_BACKGROUND);
        }

        /*if (self.get('published')) {
            self.highlight({
                type: 'strong',
                text: 'white'
            }, true);
        } else {
            self.highlight({
                type: 'strong'
            }, false);
        }*/
    },

    /**
     * Selects this connector.
     * 
     * @param {Object} [opts] - Additional options
     * @param {boolean} [opts.type] - The highlight type ('select', 'strong', 'light')
     * @param {string} [opts.color] - The highlighter color
     * @param {string} [opts.text] - The text color
     * @param {boolean} [value] - The value to set
     */
    highlight: function (opts, value) {
        //common.log('[ComponentViewModel] highlight(' + JSON.stringify(opts) + ',' + value + ')');
        var self = this;

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'select' };

        if (_.isBoolean(value)) {
            // update highlighter
            if (opts.type === 'select') {
                if (value) {
                    // set selector 
                    self.attr('.top/fill', opts.color || common.COLOR_HIGHLIGHT);
                    self.attr('.left/fill', opts.color || common.COLOR_HIGHLIGHT);
                    self.attr('.bottom/fill', opts.color || common.COLOR_HIGHLIGHT);
                    self.attr('.right/fill', opts.color || common.COLOR_HIGHLIGHT);
                    self.attr('.highlighter/visibility', 'visible');
                    // set shadow
                    self.attr('.body/filter', {
                        name: 'dropShadow',
                        args: {
                            dx: 3,
                            dy: 3,
                            blur: 2,
                            color: 'gray'
                        }
                    });
                    self.attr('.body', {
                        'stroke-width': 2
                    });
                } else {
                    self.attr('.highlighter/visibility', 'hidden');
                    self.removeAttr('.body/filter');
                    self.attr('.body', { 'stroke-width': 1 });
                }
            } else if (opts.type === 'light') {
                if (value) {
                    self.attr('.body/stroke-width', 2);
                    if (opts.color) {
                        self.bodyColor = self.attr('.body/stroke');
                        self.attr(".body/stroke", opts.color);
                    }
                } else {
                    self.attr('.body/stroke-width', 1);
                    if (self.bodyColor) {
                        self.attr(".body/stroke", self.bodyColor);
                        delete self.bodyColor;
                    }
                }
            }/* else if (opts.type === 'strong') {
                self.attr('.body/fill', value ? opts.color || 'blue' : 'white');
                self.attr('.body-text/fill', value ? opts.text || 'gray' : 'gray');
            }*/
        } else {
            // return highlighter state
            if (opts.type === 'select') return self.attr('.highlighter/visibility') === 'visible';
            else if (opts.type === 'light') return self.attr('.body/stroke-width') === 2;
            /*else if (opts.type === 'strong') return self.attr('.body/fill') !== 'white';*/
        }

    },

    _updateHighlight: function () {

    }

});

joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.Connector = ConnectorViewModel;

export default ConnectorViewModel;


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