/**
 * JointJS Link View implementation.
 * 
 * @author Javier Esparza-Peidro <jesparza@dsic.upv.es>
 */

// - List dependencies
import $ from 'jquery';
import _ from 'lodash';
import Backbone from 'backbone';
import joint from '../joint';
import common from '../common';


var LinkView = joint.dia.LinkView.extend({
    
    pointerdown: function(evt, x, y) {

    },

    pointermove: function(evt, x, y) {

    },

    pointerup: function(evt, x, y) {

    },

    mouseenter: function(evt) {
        joint.dia.LinkView.prototype.mouseenter.apply(this, arguments);
    },

    mouseleave: function(evt) {
        joint.dia.LinkView.prototype.mouseleave.apply(this, arguments);
    }

});
export default LinkView;