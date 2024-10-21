/**
 * JointJS Component View implementation.
 * 
 * This implementation provides support for:
 * - resizing
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// - List dependencies
import $ from 'jquery';
import joint from '../joint';
import common from '../common';

var ComponentView = joint.dia.ElementView.extend({
    

    /* These events are not triggered*/
    mouseover: function(evt) {
        //common.log(`[ComponentView] mouseover()`);
        //joint.dia.ElementView.prototype.mouseover.apply(this, [evt]);
        //$(evt.target).css('cursor', 'move');
        /*var pt = this.paper.pageToLocalPoint({ x: evt.pageX, y: evt.pageY });
        common.log(`[ComponentView] mouseover(${evt.pageX},${evt.pageY} - ${pt.y},${pt.y})`);

        let cell = this.model;

        // ports
        var port = cell.findPortFromPoint && cell.findPortFromPoint(pt);
        if (this.overPort && this.overPort !== port) {
            // - no longer over the previous port
            cell.highlightPort(this.overPort.id, { type: 'light' }, false);
            this.overPort = null;
        }
        if (port && port !== this.overPort) {
            // - over new port
            cell.highlightPort && cell.highlightPort(port.id, { type: 'light' }, true);
            //if (self.opts.mode === 'write') cell.state && cell.state('static');
            this.overPort = port;
        }

        // icons
        var icon = cell.findIconFromPoint && cell.findIconFromPoint(pt);
        if (this.overIcon && this.overIcon !== icon) {
            // - no longer over the previous icon
            cell.highlightIcon(this.overIcon.id, { type: 'light' }, false);
            this.overIcon = null;
        }
        if (icon && icon !== this.overIcon) {
            // - over new port
            cell.highlightIcon && cell.highlightIcon(icon.id, { type: 'light' }, true);
            this.overIcon = icon;
        }*/

    },
    mouseenter: function(evt) {
        //common.log(`[ComponentView] mouseenter()`);
        /*joint.dia.ElementView.prototype.mouseenter.apply(this, [evt]);
        if (this.model && !this.model.highlight({ type: 'light' })) this.model.highlight({ type: 'light' }, true);*/
    },
    mouseleave: function(evt) {
        //common.log(`[ComponentView] mouseleave()`);
        /*joint.dia.ElementView.prototype.mouseleave.apply(this, [evt]);
        if (this.model && this.model.highlight({ type: 'light' })) this.model.highlight({ type: 'light' }, false);*/
    },
    /*mouseout: function (evt, x, y) {
        common.log(`[ComponentView] mouseout(${x},${y})`);
        joint.dia.ElementView.prototype.mouseleave.apply(this, [evt, x, y]);
    },*/
    mousewheel: function(evt, x, y) {
        //common.log(`[ComponentView] mousewheel(${x},${y})`);
        joint.dia.ElementView.prototype.mousewheel.apply(this, [evt, x, y]);
    },

    /**
     * Triggered when the shape is dragged.
     */
    pointerdown: function(evt, x, y) {
        //common.log(`[ComponentView] pointerdown()`);
        /*if ($(evt.target).css('cursor') === 'se-resize') {
            this.resizing = true;
        }*/
        /*if (this.model.state && this.model.state() === 'static') return;
        if (this.model.get('mode') === 'read') return;*/

        joint.dia.ElementView.prototype.pointerdown.apply(this, [evt, x, y]);
    },


    /**
     * Triggered when a dragged shape moves.
     */
    pointermove: function(evt, x, y) {
        //common.log(`[ComponentView] pointermove()`);
        //if (!this.model.highlight()) return;
        /*if (this.resizing) {
            var width = x - this.model.position().x;
            var height = y - this.model.position().y;
            width = width < common.DESIGN_COMPONENT_WIDTH ? common.DESIGN_COMPONENT_WIDTH : width;
            height = height < common.DESIGN_COMPONENT_HEIGHT ? common.DESIGN_COMPONENT_HEIGHT : height;
            this.model.resize(width, height);
        } else {
            joint.dia.ElementView.prototype.pointermove.apply(this, [evt, x, y]);
        }*/
        /*if (this.model.state && this.model.state() === 'static') return;
        if (this.model.get('mode') === 'read') return;*/

        joint.dia.ElementView.prototype.pointermove.apply(this, [evt, x, y]);

    },

    /**
     * Triggered when the dragged shape is dropped.
     */
    pointerup: function(evt, x, y) {
        //common.log(`[ComponentView] pointerup()`);
        //if (!this.model.highlight()) return;
        /*this.resizing = false;
        if (this.model.state && this.model.state() === 'static') return;
        if (this.model.get('mode') === 'read') return;*/

        joint.dia.ElementView.prototype.pointerup.apply(this, [evt, x, y]);
    }


});
export default ComponentView;