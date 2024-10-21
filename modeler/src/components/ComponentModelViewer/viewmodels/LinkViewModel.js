/**
 * JointJS Link View Model.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

import _ from 'lodash';
import joint from '../joint';
import common from '../common';


var LinkViewModel = joint.dia.Link.extend({
    defaults: _.defaultsDeep({
        type: 'link',
        markup: [
            '<path class="connection"/>',
            '<path class="marker-source"/>',
            '<path class="marker-target"/>',
            '<path class="connection-wrap"/>',
            '<rect class="link-src" />',
            '<rect class="link-dst" />'
            /*
            '<g class="labels" />',
            '<g class="marker-vertices"/>',
            '<g class="marker-arrowheads"/>',
            '<g class="link-tools" />'*/
        ].join(''),
        attrs: {            
            '.marker-target': {
                stroke: "gray",
                d: 'M 10 0 L 0 5 L 10 10 L 0 5 Z'
            },
            '.connection': {
                strokeWidth: 1,
                stroke: 'gray'
            },            
            '.link-src': {
                ref: '.marker-source',
                visibility: 'hidden',
                refX: 0,
                refY: -3,
                width: 6,
                height: 6,
                fill: common.COLOR_HIGHLIGHT
            },
            '.link-dst': {
                ref: '.marker-target',
                visibility: 'hidden',
                refDx: 0,
                refDy: -7,
                width: 6,
                height: 6,
                fill: common.COLOR_HIGHLIGHT
            }
            /*'.marker-target': { 
                stroke: "gray",
                d: 'M 10 0 L 0 5 L 10 10 L 0 5 Z'
            },
            '.connection': {
                strokeWidth: 2,
                stroke: 'gray'
            },
            '.link-tools': {
                display: 'none'
            },
            '.connection-wrap': {
                display: 'none'
            },
            '.marker-arrowheads': {
                display: 'none'
            }*/
        }
    }, joint.dia.Link.prototype.defaults),

    /**
     * Initializes the role.
     * 
     * @param {Object} opts - Additional options
     * @param {string} [opts.name] - The role name
     * @param {string} [opts.mode] - The role mode ('read', 'write')
     * @param {boolean} [opts.duplex] - Determines the link is duplex
     */
    initialize: function (opts) {
        opts = opts || {};
        //if (opts.duplex) this.attr('.marker-source', { d: 'M 10 0 L 0 5 L 10 10 z' });
        joint.dia.Link.prototype.initialize.apply(this, arguments);
    },

    /**
     * Clean up listeners.
     */
    cleanUp: function () {
        common.log('[LinkViewModel] cleanUp()');
        var self = this;
    },

    /**
     * Highlights or retrieves highlight info from the link.
     * 
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.type] - The highlighting type
     * @param {string} [opts.color] - The highlight color
     * @param {boolean} [value] - The value
     */
    highlight: function (opts, value) {
        var self = this;

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'select' };

        if (_.isBoolean(value)) {
            // update highlighter
            if (opts.type === 'select') {
                self.attr('.link-src', {
                    visibility: value ? 'visible' : 'hidden',
                    fill: opts.color || common.COLOR_HIGHLIGHT
                }, { overwirte: true });
                self.attr('.link-dst', {
                    visibility: value ? 'visible' : 'hidden',
                    fill: opts.color || common.COLOR_HIGHLIGHT
                }, { overwrite: true });
                self.attr('.connection/stroke-width', value ? 2 : 1);
            } else if (opts.type === 'light') {
                self.attr('.connection/stroke-width', value ? 2 : 1);
            }
        } else {
            // return highlighter state
            if (opts.type === 'select') return self.attr('.link-src/visibility') !== 'hidden';
            else if (opts.type === 'light') return self.attr('.connection/stroke-width') === 2;
        }
    }
});
joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.LinkViewModel = LinkViewModel;

export default LinkViewModel;

`var LinkViewModel = joint.dia.Link.extend({
    defaults: _.defaultsDeep({
        type: 'link',
        markup: [
            '<path class="connection"/>',
            '<path class="marker-source"/>',
            '<path class="marker-target"/>',
            '<path class="connection-wrap"/>',
            '<rect class="link-src" />',
            '<rect class="link-dst" />'
            /*
            '<g class="labels" />',
            '<g class="marker-vertices"/>',
            '<g class="marker-arrowheads"/>',
            '<g class="link-tools" />'*/
        ].join(''),
        attrs: {
            '.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z' },
            '.connection': {
                stroke: 'gray'
            },
            '.link-src': {
                visibility: 'hidden',
                x: 0,
                y: 0,
                width: 6,
                height: 6,
                fill: 'blue'
            },
            '.link-dst': {
                visibility: 'hidden',
                dx: 0,
                dy: 0,
                width: 6,
                height: 6,
                fill: 'blue'
            }
        }
    }, joint.dia.Link.prototype.defaults),

    /**
     * Initializes the role.
     * 
     * @param {Object} opts - Additional options
     * @param {string} [opts.name] - The role name
     * @param {string} [opts.mode] - The role mode ('read', 'write')
     * @param {boolean} [opts.duplex] - Determines the link is duplex
     */
    initialize: function(opts) {
        opts = opts || {};
        if (opts.duplex) this.attr('.marker-source', { d: 'M 10 0 L 0 5 L 10 10 z' });
        joint.dia.Link.prototype.initialize.apply(this, arguments);
    },

    /**
     * Clean up listeners.
     */
    cleanUp: function() {
        common.log('[LinkVM] cleanUp()');
        var self = this;
    },

    /**
     * Highlights or retrieves highlight info from the link.
     * 
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.type] - The highlighting type
     * @param {boolean} [value] - The value
     */
    highlight: function(opts, value) {
        var self = this;

        if (_.isBoolean(opts)) {
            value = opts;
            opts = null;
        }
        opts = opts || { type: 'select' };

        if (_.isBoolean(value)) {
            // update highlighter
            if (opts.type === 'select') {
                self.attr('.link-src', {
                    visibility: value ? 'visible' : 'hidden',
                    x: self.prop('srcPoint').x - 3,
                    y: self.prop('srcPoint').y - 3,
                    width: 6,
                    height: 6,
                    fill: 'blue'
                }, { overwirte: true });
                self.attr('.link-dst', {
                    visibility: value ? 'visible' : 'hidden',
                    x: self.prop('dstPoint').x - 3,
                    y: self.prop('dstPoint').y - 3,
                    width: 6,
                    height: 6,
                    fill: 'blue'
                }, { overwrite: true });
            } else if (opts.type === 'light') {
                self.attr('.connection/stroke-width', value ? 2 : 1);
            }
        } else {
            // return highlighter state
            if (opts.type === 'select') return self.attr('.link-src/visibility') !== 'hidden';
            else if (opts.type === 'light') return self.attr('.connection/stroke-width') === 2;
        }
    }
});
joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.LinkViewModel = LinkViewModel;

export default LinkViewModel;`