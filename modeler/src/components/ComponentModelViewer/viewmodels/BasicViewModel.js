/**
 * JointJS basic subcomponent view model.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

import _ from 'lodash';
import joint from '../joint';
import ComponentViewModel from './ComponentViewModel';
import common from '../common';

var BasicViewModel = ComponentViewModel.extend({
    defaults: _.defaultsDeep({
        //type: 'komponents.Basic'
        type: "basic"
    }, joint.shapes.komponents.Component.prototype.defaults),

    /**
     * Initializes the subcomponent.
     * 
     * @param {Object} opts - Additional options
     * @param {Object} [opts.id] - The subcomponent id
     * @param {Object} [opts.name] - The subcomponent name
     * @param {string} [opts.mode] - The subcomponent mode ('read', 'locked', 'write')
     * @param {string} [opts.component] - The subcomponent identifier
     * @param {Object} [opts.variables] - The subcomponent variables
     * @param {Object} [opts.endpoints] - The subcomponent endpoints
     * @param {Object} [opts.volumes] - The subcomponent volumes
     * @param {string} [opts.color] - The subcomponent color
     */
    initialize: function(opts) {
        common.log('[BasicViewModel] initialize(' + JSON.stringify(opts) + ')');
        var self = this;

        ComponentViewModel.prototype.initialize.apply(this, arguments);

        // [TODO] 
        // - analyze model and define icons and so on ...
        // - define model change:xxx event handlers
        self.callbacks = {
                refresh: function() {
                    self.refresh();
                }
            }
            //self.on('change', self.callbacks.refresh);
            /*self.get('model').on('change', self.callbacks.refresh);
            self.on('change:name', self.callbacks.refresh);*/

        self.refresh();

    },

    /**
     * Clean up listeners.
     */
    cleanUp: function() {
        common.log('[BasicViewModel] cleanUp()');
        var self = this;

        ComponentViewModel.prototype.cleanUp(this, arguments);

        /*self.get('model').off('change', self.callbacks.refresh);
        self.off('change:name', self.callbacks.refresh);*/

        //self.off('change', self.callbacks.refresh);

    },



    /**
     * Refreshes this subcomponent display. Required when changes
     * on the component/subcomponent are performed.
     * 
     * @param {Object} [opts] - Additional options
     * @param {boolean} [opts.doNotDisplay] - Do not display changes
     */
    refresh: function(opts) {
        common.log('[BasicViewModel] refresh(' + JSON.stringify(opts) + ')');
        var self = this;

        opts = opts || {};

        //if (self.get("color")) self.set("color", common.RGBToHSL(self.get("color")));

        let header = {
            title: {
                text: self.get('name') || '',
                fill: common.COLOR_BASIC_TEXT
            },
            fill: self.get("color") || common.COLOR_BASIC_BODY, // white
            icons: []
            //icons: [{ pict: common.icons.volume, fill: 'blue' }]
        };
        if (self.get("mode") == "read") header.icons.push({pict: common.icons.readonly, fill: common.COLOR_BASIC_TEXT});
        else if (self.get("mode") == "locked") header.icons.push({pict: common.icons.lock, fill: common.COLOR_BASIC_TEXT});

        var body = {
            /*stroke: darkColor,*/
            fill: self.get("color") || common.COLOR_BASIC_BODY,
            icons: []
        };
        var footer = {
            fill: self.get("color") || common.COLOR_BASIC_BODY
        };

        // Analyze model
        //
        // - cardinality
        var cardinality = self.get('cardinality');
        if (cardinality) {
            var range = common.range(cardinality);
            if (range.min !== 0 || range.max !== null)
                footer.title = cardinality;
        }

        // - endpoints
        var ports = [];
        var endpoints = self.get('endpoints');
        _.each(endpoints, (endpoint, endpointId) => {
            //common.log(`adding port: ${endpointId}`);
            var port = {
                id: endpointId,
                name: endpoint[`@name`],
                type: endpoint.type,
                position: endpoint.type == "in" && "left" || "right",
                published: endpoint[`@published`]
            };
            ports.push(port);
        });

        // - volumes
        var volumes = self.get('volumes');
        if (volumes && Object.keys(volumes).length) {
            body.icons.push({
                name: 'volumes',
                pict: common.icons.volume,
                count: Object.keys(volumes).length,
            });
        }

        // - variables
        var variables = self.get('variables');
        if (variables && Object.keys(variables).length) {
            body.icons.push({
                name: 'variables',
                pict: common.icons.variable,
                count: Object.keys(variables).length,
            });
        }

        self.header(header);
        self.body(body);
        self.footer(footer);
        self.resetPorts(ports);
        /*_.each(ports, function(port) {
            self.highlightPort(port.id, { type: 'strong', color: '#0277bd', text: 'white' }, port.published ? true : false);
        });*/

    }
});

joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.Basic = BasicViewModel;

export default BasicViewModel;