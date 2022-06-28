const { gathering, constellation } = require('../entities/index')

 async function up () {
  try {
    let constellations = await constellation.model.find()

    await Promise.all(constellations.map(async conste => {
      conste.gatherings = await gathering.model.find({ constellation: conste._id })

      return await conste.save()
    }))
  } catch (e) {
    console.error(e)
    return false
  }
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };