<template>
<v-icon v-if="name"> {{ name }}</v-icon>
<i v-else class="v-icon">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    :height="height"
    :viewBox="viewBox"
    :aria-labelledby="name"
    role="presentation"
    >
    <title :id="name" lang="en">{{ name }} icon</title>
    <g :fill="color" v-html="content"></g>
  </svg>
</i>
  <!--i class="v-icon" v-html="$model.icons['volume']"></i-->
</template>
<script>
import _ from "lodash";
export default {
  name: "SvgIcon",
  props: {    
    width: {
      type: [Number, String],
      default: 24
    },
    height: {
      type: [Number, String],
      default: 24
    },
    color: {
      type: String,
      default: 'currentColor'
    },
    /**
     * Determines the icon name
     */
    name: {
        type: String
    },
    /**
     * Determines the icon SVG content 
     */
    content: {
        type: String
    },
    /**
     * Determines the URL of the SVG icon [TODO]
     */
    src: {
      type: String,
    },
  },
  computed: {
      viewBox() {
          //return `0 0 ${this.width} ${this.height}`
          return `0 0 24 24`
      }
  },
  created() {
      this.$util.log('[SvgIcon] created()');
  }
};
</script>
<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>