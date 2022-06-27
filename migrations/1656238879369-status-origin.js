const { status } = require('../api/entities/index')

 async function up () {
  try {
    let statuses = await status.model.find()

    await Promise.all(statuses.map(async status => {

      if (status.parent && !status.origin) {
        status.origin = status.parent
      }

      return await status.save()
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