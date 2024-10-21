/**
 * JointJS composite subcomponent view model.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

import _ from 'lodash';
import joint from '../joint';
import ComponentViewModel from './ComponentViewModel';
import common from '../common';

var CompositeViewModel = ComponentViewModel.extend({
    defaults: _.defaultsDeep({
        //type: 'komponents.Composite'
        type: "composite"
    }, joint.shapes.komponents.Component.prototype.defaults),

    /**
     * Initializes the component.
     * 
     * @param {Object} opts - Additional options
     * @param {Object} [opts.id] - The subcomponent id
     * @param {Object} [opts.name] - The subcomponent name
     * @param {stirng} [opts.mode] - The subcomponent mode ('read', 'locked', 'write')
     * @param {string} [opts.component] - The subcomponent identifier
     * @param {Object} [opts.variables] - The subcomponent variables
     * @param {Object} [opts.endpoints] - The subcomponent endpoints
     * @param {Object} [opts.volumes] - The subcomponent volumes
     * @param {string} [opts.color] - The subcomponent color
     */
    initialize: function(opts) {
        common.log('[CompositeViewModel] initialize(' + JSON.stringify(opts) + ')');
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
        common.log('[CompositeViewModel] cleanUp()');
        var self = this;

        ComponentViewModel.prototype.cleanUp(this, arguments);

        /*self.get('model').off('change', self.callbacks.refresh);
        self.off('change:name', self.callbacks.refresh);*/

    },

    /**
     * Refreshes this role display. Required when changes
     * on the component/role are performed.
     * 
     * @param {Object} [opts] - Additional options
     */
    refresh: function(opts) {
        //common.log('[CompositeViewModel] refresh(' + JSON.stringify(opts) + ')');
        var self = this;

        opts = opts || {};

        let headerColor = self.get("color") && common.colorLuminance(self.get("color"), -0.25) || common.COLOR_COMPOSITE_HEADER;
        let bodyColor = self.get("color") && common.colorLuminance(self.get("color"), 0.25) || common.COLOR_COMPOSITE_BODY;

        var header = {
            title: {
                text: self.get('name') || '',
                fill: common.COLOR_COMPOSITE_TEXT
            },
            fill: headerColor,
            icons: []
        };
        if (self.get("mode") == "read") header.icons.push({pict: common.icons.readonly, fill: common.COLOR_COMPOSITE_TEXT});
        else if (self.get("mode") == "locked") header.icons.push({pict: common.icons.lock, fill: common.COLOR_COMPOSITE_TEXT});

        var body = {
            fill: bodyColor,
            icons: []
        };
        var footer = {
            fill: bodyColor
        };

        var ports = [];
        var published = [];

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
        var endpoints = self.get('endpoints');
        _.each(endpoints, function(endpoint, endpointId) {
            var port = {
                id: endpointId,
                name: endpoint[`@name`],
                type: endpoint.type,
                published: endpoint[`@published`]
            };
            ports.push(port);
        });

        /* - endpoints
        var layoutEndpoints = self.get('endpoints');
        var endpoints = self.get('model').get('endpoints');
        _.each(layoutEndpoints, function(layoutEndpoint) {
            if (endpoints[layoutEndpoint.id]) {
                var port = {
                    id: layoutEndpoint.id,
                    name: layoutEndpoint.name,
                    type: layoutEndpoint.type,
                    position: layoutEndpoint.position,
                    published: layoutEndpoint.published
                };
                ports.push(port);
            }
        });
        _.each(endpoints, function(endpoint, endpointId) {
            if (!_.find(ports, function(port) {
                return port.id === endpointId;
            })) {
                var port = {
                    id: endpointId,
                    name: endpoint.name,
                    type: endpoint.type,
                    published: endpoint.published
                };
                ports.push(port);
            }
        });
        common.log('PORTS -> ' + JSON.stringify(ports));*/

        // - volumes
        var volumes = self.get('volumes');
        if (volumes && Object.keys(volumes).length) {
            body.icons.push({
                name: 'volumes',
                pict: common.icons.volume,
                count: Object.keys(volumes).length,
                fill: headerColor
            });
        }

        // - variables
        var variables = self.get('variables');
        if (variables && Object.keys(variables).length) {
            body.icons.push({
                name: 'variables',
                pict: common.icons.variable,
                count: Object.keys(variables).length,
                fill: headerColor
            });
        }

        self.header(header);
        self.body(body);
        self.footer(footer);
        self.resetPorts(ports);
        /*_.each(ports, function (port) {
            self.highlightPort(port.id, { type: 'strong', color: '#0277bd', text: 'white' }, port.published ? true : false);
        });*/

        /*if (self.get('el')) {

            common.log('port with el!!');

            // - if refresh takes place in the DOM
            //   container
            var $el = self.get('el');

            // - remove displayed ports
            $el.find('.k-diagram-design-endpoint').remove();

            // - add ports
            var ports = self.getPorts();
            var leftPorts = _.filter(ports, function (port) { return port.position === 'left'; });
            var rightPorts = _.filter(ports, function (port) { return port.position === 'right'; });

            var range = 100 / (leftPorts.length + 1);
            var y = range;
            _.each(leftPorts, function (port, i) {
                var html = '<div class="k-diagram-design-endpoint k-diagram-design-endpoint-left" style="top: ' + y + '%;" data-id="' + port.id + '">' + port.type + '</div>';
                $el.append(html);
                y += range;
            });

            range = 100 / (rightPorts.length + 1);
            y = range;
            _.each(rightPorts, function (port, i) {
                var html = '<div class="k-diagram-design-endpoint k-diagram-design-endpoint-right" style="top: ' + y + '%;" data-id="' + port.id + '">' + port.type + '</div>';
                $el.append(html);
                y += range;
            });

        }*/
    }
});

joint.shapes.komponents = joint.shapes.komponents || {};
joint.shapes.komponents.Composite = CompositeViewModel;

export default CompositeViewModel;