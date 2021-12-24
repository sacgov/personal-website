window.onload = function () {
    var toc = document.querySelector('.toc');
    var tocItems;
    var TOP_MARGIN = 0.35,
        BOTTOM_MARGIN = 0.2;

    // window.addEventListener('resize', drawPath, false);
    window.addEventListener('scroll', sync, false);
    drawPath();

    function drawPath() {
        tocItems = [].slice.call(toc.querySelectorAll('li'));

        // Cache element references and measurements
        tocItems = tocItems.map(function (item) {
            var anchor = item.querySelector('a');
            var target = document.getElementById(anchor.getAttribute('href').slice(1));
            return {
                listItem: item,
                anchor: anchor,
                target: target
            };
        });

        // Remove missing targets
        tocItems = tocItems.filter(function (item) {
            return !!item.target;
        });

        sync();

    }

    function sync() {
        var windowHeight = window.innerHeight;
        for (var i = 0; i < tocItems.length - 1; i++) {
            var currentTocItem = tocItems[i];
            var currentTargetBounds = currentTocItem.target.getBoundingClientRect();
            var nextTocItem = tocItems[i + 1];
            var nextTargetBounds = nextTocItem.target.getBoundingClientRect();


            if (nextTargetBounds.top > windowHeight * TOP_MARGIN && currentTargetBounds.top < windowHeight * (1 - BOTTOM_MARGIN)) {
                currentTocItem.listItem.classList.add('current');
            }
            else {
                currentTocItem.listItem.classList.remove('current');
            }
        }
        // handle last item
        if (tocItems.length > 0) {
            var lastItem = tocItems[tocItems.length - 1];
            var lastTargetBounds = lastItem.target.getBoundingClientRect();
            if (lastTargetBounds.top < windowHeight * (1 - BOTTOM_MARGIN)) {
                lastItem.listItem.classList.add('current');
            }
            else {
                lastItem.listItem.classList.remove('current');
            }
        }
    }

};