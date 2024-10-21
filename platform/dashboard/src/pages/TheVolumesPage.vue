<template>
  <div class="dashboard">
    <md-toolbar class="md-primary">
      <div class="md-toolbar-row">
        <div class="md-toolbar-section-start">
          <md-button v-if="$root.isMobile" class="md-icon-button" @click="$root.showNavigation = true">
            <md-icon>menu</md-icon>
          </md-button>
          <div class="md-title">
            <md-icon class="mdi mdi-database"></md-icon>&nbsp;Volumes
          </div>
        </div>
        <div class="md-toolbar-section-end">
          <md-button class="md-icon-button">
            <md-icon>more_vert</md-icon>
          </md-button>
        </div>
      </div>
    </md-toolbar>

    <md-content>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam nec enim a quam faucibus ultricies. Integer sit amet mi id est luctus efficitur. Curabitur arcu ex, placerat et urna nec, lacinia euismod nulla. Ut mollis velit nisl, et tristique arcu faucibus eget. Cras vestibulum tellus nec pulvinar ullamcorper. Ut iaculis feugiat augue, et lobortis augue laoreet eu. Mauris quis sem quis quam convallis dictum. Etiam aliquam quam ac cursus aliquet.

Praesent accumsan blandit nibh, sit amet hendrerit mi mattis eu. Proin commodo lorem nec purus ultrices ornare. Curabitur sed consectetur velit, ac lacinia dolor. Vestibulum aliquam pulvinar metus sit amet pharetra. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla ac pharetra risus. In hac habitasse platea dictumst. Pellentesque ac leo quis dui sagittis convallis et ac orci.

Aliquam sit amet laoreet nunc. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Cras eu urna massa. Praesent elementum eleifend convallis. Morbi elementum felis est, sed mollis nunc volutpat eu. Curabitur in consectetur ante. Suspendisse fermentum commodo diam eget aliquet. Morbi vestibulum, nisl sagittis consequat dapibus, ligula nisi sagittis felis, vel convallis augue massa ut odio. Curabitur nulla neque, hendrerit sit amet justo et, molestie sollicitudin dolor. Nunc sollicitudin et leo sit amet blandit. Suspendisse congue enim ac fermentum rutrum. Sed placerat imperdiet velit, suscipit interdum turpis pretium eu. Aenean facilisis congue faucibus. Quisque blandit nisi sed tellus iaculis, sed commodo libero posuere. Nullam vehicula, sem id porta volutpat, augue sapien molestie nulla, quis dapibus arcu leo nec metus.

Mauris tempor eleifend est, sed luctus enim. Aenean efficitur, metus a consectetur auctor, libero lacus egestas velit, elementum auctor est sem nec mi. Maecenas id pulvinar ipsum. Phasellus sollicitudin placerat dui, sed dignissim nisi dapibus nec. Maecenas tempor sapien vitae diam tempor, at aliquam sem pulvinar. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Phasellus ullamcorper tincidunt felis vitae pellentesque. Nunc elementum condimentum aliquam.

Nam consectetur dui vitae risus iaculis porta. Aenean at arcu fringilla, tempus odio quis, malesuada libero. Aenean tincidunt neque id sodales commodo. Nullam at dignissim nisl. Etiam nec odio eu arcu posuere porta et quis augue. Aenean purus eros, congue at diam et, condimentum finibus nibh. Pellentesque pharetra dictum arcu, sit amet vehicula velit venenatis sed. Integer a augue ultrices, porta massa in, mollis lorem. Sed interdum lacinia tempor. Morbi vel pulvinar eros. Maecenas ultricies sodales turpis, ut mattis turpis rhoncus eget. Phasellus facilisis eleifend efficitur. Nunc enim nisi, dictum a lacus eu, posuere condimentum augue. Curabitur quis nisi purus. Donec eget ex vitae tellus maximus tincidunt. Duis pulvinar sit amet tellus at consectetur.
    </md-content>
  </div>
</template>

<script>
export default {
  name: "TheVolumesPage",
  data() {
    return {
    };
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.md-toolbar {
    position: sticky !important;
    top: 0px;
}
</style>
