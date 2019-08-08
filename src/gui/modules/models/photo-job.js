import _ from 'lodash'
import moment from 'moment'
import File from '../file'
import Timer from '../timer'

const debug = require('debug').default('app:modules:models:photo-job')

export default class PhotoJob {
  constructor(id, photo) {
    this.id = id
    this.photo = photo

    this.process = undefined

    // Output file, this is the photo already transformed!
    this.file = File.fromPath(photo.getFolderPath(this.getFileName()))

    // Clean initialization
    this.reset()

    this.debug(`Job created`, {
      id: this.id,
      photo: this.photo,
      file: this.file
    })
  }

  /**
   * Restart the information for a possible remake
   */
  reset() {
    // CLI messages
    this.cli = {
      lines: [],
      error: ''
    }

    this.isLoading = false
    this.hasFailed = false
    this.hasFinished = false

    this.timer = new Timer()
    this.file.remove()
  }

  /**
   *
   * @param {*} message
   * @param  {...any} args
   */
  debug(message, ...args) {
    debug(`[${this.id}] ${message} `, ...args)
  }

  /**
   * The Job has begun
   */
  onStart() {
    this.isLoading = true
    this.timer.start()
  }

  /**
   * The Job has finished successfully
   */
  onFinish() {
    this.isLoading = false
    this.hasFinished = true
    this.timer.stop()
  }

  /**
   * The Job has failed
   */
  onFail() {
    this.isLoading = false
    this.hasFailed = true
    this.timer.stop()
  }

  /**
   * ID. Execution Number
   */
  getId() {
    return this.id
  }

  /**
   *
   */
  getPhoto() {
    return this.photo
  }

  /**
   * Transformed File Name
   */
  getFileName() {
    const now = moment().unix()

    // Original name normalized to avoid problems
    const originalName = _.truncate(
      _.deburr(this.photo.getSourceFile().getName()),
      { length: 30, omission: '' }
    )

    return `${originalName}-${this.id}-${now}-dreamtime.png`
  }

  /**
   *
   */
  getFile() {
    return this.file
  }

  /**
   *
   */
  cancel() {
    if (!this.isLoading || _.isNil(this.process)) {
      return
    }

    this.process.emit('kill')
  }

  /**
   *
   */
  start() {
    return new Promise((resolve, reject) => {
      const onSpawnError = error => {
        reject(
          new AppError(
            `Unable to start the CLI!\n
            This can be caused by a corrupt installation, please make sure that the cli executable exists and works correctly.`,
            error
          )
        )
      }

      try {
        this.process = $tools.transform(this)
      } catch (error) {
        onSpawnError(error)
        return
      }

      this.process.on('error', error => {
        // Error before starting
        onSpawnError(error)
      })

      this.process.on('stdout', output => {
        // Output generated by the CLI
        output = output
          .toString()
          .trim()
          .split('\n')

        output.forEach(text => {
          this.cli.lines.unshift({
            text,
            css: {}
          })
        })
      })

      this.process.on('stderr', output => {
        // CLI error
        this.cli.lines.unshift({
          text: output,
          css: {
            'text-danger': true
          }
        })

        this.cli.error += `${output}\n`
      })

      this.process.on('ready', code => {
        if (code === 0 || _.isNil(code)) {
          // The process has been completed successfully
          // Update the output file information.
          this.file.update()
          this.process = undefined
          resolve()
        } else {
          this.process = undefined

          reject(
            new AppError(
              `The process has been interrupted by an CLI error. This can be caused by:\n
              - A corrupt installation
              - Insufficient RAM. Buy more RAM!
              - If you are using Custom GPU ID: The NVIDIA graphics card could not be found`,
              new Error(this.cli.error)
            )
          )
        }
      })
    })
  }
}
