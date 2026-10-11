// Marque: put every page into one Illustrator document.
//
// Keep this file in the folder with the page .ai files, then in Illustrator choose
// File > Scripts > Other Script... and pick it. Each page opens as editable artwork
// and is pasted onto its own artboard, on its own layer, in a new document.
//
// Illustrator scripts are ExtendScript (ES3): no let/const, arrow functions or template strings.

(function () {
  var folder = File($.fileName).parent
  var files = folder.getFiles(function (f) {
    return f instanceof File && /\.ai$/i.test(f.name)
  })
  if (!files.length) {
    alert('No .ai pages found next to this script. Keep it in the folder with the pages.')
    return
  }
  files.sort(function (a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  var GAP = 72 // between artboards, in points
  var ROW = 12000 // start a new row past this width

  var oldLevel = app.userInteractionLevel
  var oldSystem = app.coordinateSystem
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS
  // One coordinate system for artboards and artwork, with y going up.
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM
  try {
    app.preferences.PDFFileOptions.pageToOpen = 1
  } catch (e) {}

  /** Union of the selection's bounds: [left, top, right, bottom]. */
  function bounds(sel) {
    var b = null
    for (var i = 0; i < sel.length; i++) {
      var g = sel[i].geometricBounds
      if (!b) b = [g[0], g[1], g[2], g[3]]
      else b = [Math.min(b[0], g[0]), Math.max(b[1], g[1]), Math.max(b[2], g[2]), Math.min(b[3], g[3])]
    }
    return b
  }

  var dest = null
  var x = 0
  var top = 0
  var rowBottom = 0
  var done = 0
  var failed = []

  try {
    for (var i = 0; i < files.length; i++) {
      var src
      try {
        src = app.open(files[i])
      } catch (e) {
        failed.push(files[i].name)
        continue
      }
      var a = src.artboards[0].artboardRect
      var w = a[2] - a[0]
      var h = a[1] - a[3]

      // Where this page's artboard goes.
      if (!dest) {
        dest = app.documents.add(DocumentColorSpace.RGB, w, h)
        var r = dest.artboards[0].artboardRect
        x = r[0]
        top = r[1]
        rowBottom = r[3]
      } else {
        if (x + GAP + w - dest.artboards[0].artboardRect[0] > ROW) {
          x = dest.artboards[0].artboardRect[0]
          top = rowBottom - GAP
          rowBottom = top
        } else x += GAP
      }
      var rect = [x, top, x + w, top - h]
      var name = decodeURI(files[i].name).replace(/\.ai$/i, '')
      var board = done === 0 ? dest.artboards[0] : dest.artboards.add(rect)
      board.artboardRect = rect
      board.name = name
      x += w
      if (top - h < rowBottom) rowBottom = top - h

      // Copy the page's artwork, remembering where it sat on its artboard.
      app.activeDocument = src
      app.executeMenuCommand('unlockAll')
      app.executeMenuCommand('showAll')
      app.executeMenuCommand('selectall')
      var sel = src.selection
      if (sel && sel.length) {
        var sb = bounds(sel)
        app.copy()

        app.activeDocument = dest
        dest.selection = null
        var layer = done === 0 ? dest.layers[0] : dest.layers.add()
        layer.name = name
        dest.activeLayer = layer
        dest.artboards.setActiveArtboardIndex(dest.artboards.length - 1)
        app.executeMenuCommand('pasteInPlace')
        var pasted = dest.selection
        if (pasted && pasted.length) {
          // Line it up exactly, whatever position the paste chose.
          var pb = bounds(pasted)
          var dx = rect[0] + (sb[0] - a[0]) - pb[0]
          var dy = rect[1] + (sb[1] - a[1]) - pb[1]
          for (var j = 0; j < pasted.length; j++) {
            pasted[j].translate(dx, dy)
            if (pasted[j].layer.name !== name) pasted[j].move(layer, ElementPlacement.PLACEATEND)
          }
        }
        dest.selection = null
      }
      src.close(SaveOptions.DONOTSAVECHANGES)
      done++
    }
  } finally {
    app.userInteractionLevel = oldLevel
    app.coordinateSystem = oldSystem
  }

  if (!dest) {
    alert('Illustrator could not open any of the pages.')
    return
  }
  app.activeDocument = dest
  dest.artboards.setActiveArtboardIndex(0)
  app.executeMenuCommand('fitall')
  alert(
    'Placed ' + done + ' page' + (done === 1 ? '' : 's') + ' on artboards.' +
      (failed.length ? '\nCould not open: ' + failed.join(', ') : '') +
      '\n\nSave with File > Save As to keep it as an .ai file.'
  )
})()
